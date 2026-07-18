-- =====================================================================
-- CAIRN — 0004_proximity_gate.sql
-- CRN-005 (server-side proximity gate) + CRN-020 (Space-scoped
-- visibility) + table privileges, the one remaining write policy, and the
-- proximity-checked write RPCs (stack_stone, add_pin) plus CRN-019's
-- join_space_by_code.
--
-- NOT EXECUTED. Run after 0003_auth.sql. Safe to re-run.
--
-- This file is the security boundary of the entire product. SECURITY
-- DEFINER bypasses RLS on every table it touches — that is the point, and
-- it also means there is no second net underneath these function bodies.
-- Everything below therefore:
--   * pins its search_path to EMPTY — `set search_path = ''`, per CRN-005.
--     Not `public, pg_temp`: with `public` on the path inside a definer
--     function owned by the project owner, anything that can CREATE in
--     public can shadow an operator or a function and get resolved to
--     instead of the real one. Empty costs nothing here because every
--     identifier is already schema-qualified, and it is what the ticket
--     asks for,
--   * schema-qualifies every identifier anyway,
--   * derives identity from auth.uid() inside the function. Position is an
--     input. Identity never is. No function here takes a user id,
--   * DERIVES storage object paths from ids rather than echoing whatever
--     string a client once wrote into a column. See cairn_detail.
--
-- TWO GATES, DO NOT CONFLATE THEM:
--   MEMBERSHIP decides whether a cairn exists for you at all. Runs first,
--     at any distance including zero. A non-member gets nothing — no
--     marker, no glyph, no count. Not a padlock: a padlock tells a
--     competitor a Space exists, where it operates, and how busy it is.
--   PROXIMITY decides whether you may hear it. Runs second, and only on
--     media, transcripts and pin notes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers. SECURITY DEFINER because they are called FROM RLS policies,
-- and a policy's subquery is itself subject to RLS — an `exists (select 1
-- from public.cairns ...)` written inline in a policy would see zero rows,
-- because cairns has no select policy. These functions bypass that. They
-- return booleans only; they leak nothing beyond yes/no about ids the
-- caller already holds.
--
-- is_space_member() is the live one, used by "spaces select mine" and
-- "cairns insert own". can_write_cairn() and owns_stone() are kept as the
-- single definition of "may write here" / "is mine" for CRN-018's and
-- CRN-019's policy work; the stone and pin policies that used to call them
-- are gone (see WRITE POLICIES). Both are still correct and still cost
-- nothing sitting here — but note that neither can express proximity, so
-- neither is ever sufficient on a content write on its own.
-- ---------------------------------------------------------------------

create or replace function public.is_space_member(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_space_id is not null
     and auth.uid() is not null
     and exists (
       select 1 from public.space_members m
       where m.space_id = p_space_id
         and m.user_id = auth.uid()
     );
$$;

-- "May the caller attach something to this cairn?" — membership only, no
-- proximity. Proximity cannot live in a policy at all: the device's
-- position is not a fact about the session and there is nowhere for a
-- policy to read it from. That is what stack_stone() and add_pin() are
-- for, and it is why a policy alone was never enough on stones or pins.
create or replace function public.can_write_cairn(p_cairn_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cairns c
    where c.id = p_cairn_id
      and auth.uid() is not null
      and (
        -- PERSONAL cairns are PUBLIC, gated by proximity alone. This is the
        -- consumer product, not an oversight: "leave your voice somewhere, so
        -- it's only heard by whoever stands there next" — and whoever stands
        -- there next is, by definition, someone else. Demo cairns 1 and 4
        -- (the one addressed to the judges) are personal cairns that strangers
        -- must be able to hear. Restricting these to created_by renders an
        -- empty map for every visitor and silently kills the pitch.
        c.space_id is null
        -- SPACE cairns are the ones PLAN.md makes invisible to non-members.
        or public.is_space_member(c.space_id)
      )
  );
$$;

create or replace function public.owns_stone(p_stone_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.stones s
    where s.id = p_stone_id
      and auth.uid() is not null
      and s.author_id = auth.uid()
  );
$$;

revoke execute on function public.is_space_member(uuid)  from public;
revoke execute on function public.can_write_cairn(uuid)  from public;
revoke execute on function public.owns_stone(uuid)       from public;
grant  execute on function public.is_space_member(uuid)  to authenticated, service_role;
grant  execute on function public.can_write_cairn(uuid)  to authenticated, service_role;
grant  execute on function public.owns_stone(uuid)       to authenticated, service_role;


-- ---------------------------------------------------------------------
-- TABLE PRIVILEGES — the half of RLS that is easy to forget
--
-- RLS sits ON TOP OF Postgres privileges, not instead of them. A policy
-- with no matching GRANT is a dead letter: the statement is refused with
-- `permission denied for table cairns` before a single policy is
-- consulted. 0001 creates the tables and enables RLS and grants nothing,
-- so without this block EVERY write policy in this file never fires —
-- CRN-009's personal cairn drop 403s at 13:00 and surfaces in RN as a
-- vague network error, which is exactly what the comment on the
-- `space_id is null` branch below is trying to prevent.
--
-- supabase/config.toml states the reason this bites now: with
-- `auto_expose_new_tables` unset, new entities in `public` are NOT
-- auto-exposed to the Data API roles. Older projects had the legacy
-- grant-everything default, which is why the REVOKE comes first — it
-- normalises both cases to the same explicit posture.
--
-- REVOKE everything, then grant back exactly what a policy backs. Reads on
-- cairns/stones/pins/briefings are then default-deny by PRIVILEGE as well
-- as by policy, so a `using (true)` pasted in a panic at 15:00 still
-- cannot leak a stone. service_role is deliberately untouched: it bypasses
-- RLS and does the seeding (CRN-026/027) and the signing.
-- ---------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

revoke all on public.profiles      from anon, authenticated;
revoke all on public.spaces        from anon, authenticated;
revoke all on public.space_members from anon, authenticated;
revoke all on public.cairns        from anon, authenticated;
revoke all on public.stones        from anon, authenticated;
revoke all on public.pins          from anon, authenticated;
revoke all on public.briefings     from anon, authenticated;

-- Backed by "profiles select own" / "profiles update own" (0003).
grant select, update on public.profiles      to authenticated;
-- Backed by "spaces select mine".
grant select         on public.spaces        to authenticated;
-- Backed by "space_members select own".
grant select         on public.space_members to authenticated;
-- Backed by "cairns insert own" — the ONLY direct client write left.
grant insert         on public.cairns        to authenticated;

-- Deliberately no privilege of any kind on stones, pins or briefings, and
-- nothing at all to anon. Those three are reachable only through the
-- SECURITY DEFINER functions below, which execute as the owner and so need
-- no grant of their own.


-- ---------------------------------------------------------------------
-- WRITE POLICIES
--
-- Exactly one direct client write survives: dropping a cairn. Everything
-- that attaches CONTENT to a cairn goes through an RPC.
--
-- WHY, and this is the correction that matters: a policy cannot see the
-- device's position. There is nowhere for it to read one from. So an
-- `insert` policy on stones enforces membership and authorship and
-- NOTHING ELSE — `from('stones').insert({cairn_id, author_id, kind, ...})`
-- succeeds from the other side of the country for any cairn in any Space
-- you belong to. With that door open, stack_stone's distance check is
-- decorative: nothing forces a caller through it, and a judge with curl
-- stacks a stone onto the demo cairn from the car park. CRN-017's premise
-- fails the same way CRN-005's would.
--
-- Dropping a cairn is different and keeps its policy: the drop point IS
-- the caller's position (CRN-009), so there is no second position to check
-- it against and nothing to lie about.
--
-- TRAP, and it will cost ten minutes: there are no select policies on
-- cairns, so supabase.from('cairns').insert(row).select() FAILS — the
-- .select() needs a select policy that deliberately does not exist. Call
-- .insert(row) WITHOUT .select() and generate the row id client-side with
-- crypto.randomUUID() so you already know it.
-- ---------------------------------------------------------------------

-- spaces: you may read a Space you belong to (or created). No policy
-- exposes join_code lookup — if a client could `select * from spaces where
-- join_code = $1` it could also `select join_code from spaces` and walk
-- every Space in the database. The code lookup lives inside
-- public.join_space_by_code() at the foot of this file (CRN-019's
-- function), where RLS does not apply.
drop policy if exists "spaces select mine" on public.spaces;
create policy "spaces select mine"
  on public.spaces
  for select
  to authenticated
  using (public.is_space_member(spaces.id) or spaces.created_by = auth.uid());

-- space_members: your own rows only. A policy on space_members that itself
-- queries space_members raises "infinite recursion detected in policy" —
-- restricting to user_id = auth.uid() avoids it with no helper.
drop policy if exists "space_members select own" on public.space_members;
create policy "space_members select own"
  on public.space_members
  for select
  to authenticated
  using (space_members.user_id = auth.uid());

-- cairns: insert only, never select. CRN-020 keeps default-deny on reads;
-- the membership predicate lives in the RPC body below, once.
-- created_by must be the caller — never a client-supplied field. The
-- `space_id is null` branch is load-bearing: without it a personal drop
-- 403s and surfaces in RN as a vague network error.
drop policy if exists "cairns insert own" on public.cairns;
create policy "cairns insert own"
  on public.cairns
  for insert
  to authenticated
  with check (
    cairns.created_by = auth.uid()
    and (cairns.space_id is null or public.is_space_member(cairns.space_id))
  );

-- stones and pins: NO client policy, insert or update. These drops are
-- deliberate and are listed so that re-running this file removes an
-- earlier permissive version rather than leaving it behind.
--
-- Two holes closed at once, and the second is the one that hurt:
--
--   1. NO PROXIMITY. See above. public.stack_stone() and public.add_pin()
--      are now the only way in and both re-derive distance server-side.
--
--   2. NO CONFUSED DEPUTY. audio_url/image_url hold storage object paths,
--      the key layout is deterministic and documented
--      ({cairn_id}/{stone_id}.m4a), and cairn_detail hands paths to an
--      Edge Function that signs them with the service-role key. A client
--      that could write those columns freely could therefore: stand 200m
--      from a cairn in a Space it legitimately belongs to, read every
--      stone id out of the `approaching` band, construct the victim's
--      exact object paths from the convention, drop a personal decoy
--      cairn at its own feet, insert a stone on the decoy carrying the
--      VICTIM's path, then call cairn_detail on the decoy at distance 0
--      and have the signer mint a signed URL for someone else's audio.
--      Membership survives that attack; proximity does not, and proximity
--      is the pitch. The `stones update own` policy did it post-hoc
--      without even needing the decoy.
--
--      Paths are now derived from ids in two places and accepted from a
--      client in neither: stack_stone/add_pin build the canonical key and
--      reject a mismatch, and cairn_detail re-derives on read (see below)
--      so a bound path is the only thing that can ever reach the signer.
drop policy if exists "stones insert own"     on public.stones;
drop policy if exists "stones update own"     on public.stones;
drop policy if exists "pins insert own stone" on public.pins;
drop policy if exists "pins update own stone" on public.pins;

-- NOTE FOR CRN-011 / CRN-012 / CRN-013 / CRN-017: the upload order changed
-- and it is now the one CRN-017 asked for. Generate the row id on the
-- client with crypto.randomUUID(), upload to the key derived from it, THEN
-- call stack_stone(..., p_stone_id) / add_pin(..., p_pin_id). There is no
-- insert-then-write-the-path-back step any more, because the write-back
-- update was the confused deputy.

-- briefings: no client policy at all, read or write. Generated and stored
-- by the Edge Function on the service key (CRN-023); read only through
-- cairn_detail() below, in the unlocked band.


-- ---------------------------------------------------------------------
-- RPC 1 — cairns_nearby(p_lat, p_lng, p_max_m)
--
-- TIER 1 OF THE TWO-TIER CONTRACT. Goes to any authenticated caller for
-- cairns they are entitled to see. Returns positions, titles, counts and
-- distances. Returns NO content: no stone rows, no kinds, no URLs, no
-- transcripts, no body text. Grep this function for `audio` — there is
-- nothing to find, and that is deliberate.
--
-- stone_count is computed here because the map glyph's height encodes it,
-- and PostgREST's embedded `stones(count)` cannot work with no select
-- policy on stones.
--
-- CRN-020's membership predicate is written literally, right here. RLS
-- does NOT cover it — SECURITY DEFINER bypasses RLS. Forgetting this
-- clause leaks another company's cairn POSITIONS onto the map, which is
-- worse than leaking audio.
--
-- Null-safety: auth.uid() is null for an anon request, and
-- `c.created_by = null` evaluates to null, not true — so personal cairns
-- are correctly excluded. The explicit `auth.uid() is not null` guard at
-- the top makes that intentional rather than accidental.
-- ---------------------------------------------------------------------

-- Dropped explicitly rather than replaced: changing a returns-table
-- signature in place is an error, and Postgres would otherwise keep the
-- old overload around for PostgREST to fail to disambiguate (which reads
-- as PGRST202 "function not found").
drop function if exists public.cairns_nearby(double precision, double precision, double precision);

create function public.cairns_nearby(
  p_lat   double precision,
  p_lng   double precision,
  p_max_m double precision default 5000
)
returns table (
  id          uuid,
  lat         double precision,
  lng         double precision,
  title       text,
  space_id    uuid,
  accent_hex  text,
  radius_m    integer,
  stone_count integer,
  distance_m  integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.lat,
    c.lng,
    c.title,
    c.space_id,
    -- personal cairns render in the default amber; Space cairns in the
    -- Space's accent (CRN-021).
    coalesce(s.accent_hex, '#D9A441') as accent_hex,
    c.radius_m,
    (select count(*) from public.stones st where st.cairn_id = c.id)::integer as stone_count,
    -- rounded to a whole metre: float noise under a glyph looks broken on
    -- a projector.
    round(public.distance_m(c.lat, c.lng, p_lat, p_lng))::integer as distance_m
  from public.cairns c
  left join public.spaces s on s.id = c.space_id
  where auth.uid() is not null
    -- MEMBERSHIP GATE (CRN-020). Runs regardless of distance.
    -- Personal cairns (space_id is null) are PUBLIC — proximity is their only
    -- gate. Only Space cairns are membership-scoped. See is_cairn_visible().
    and (
      c.space_id is null
      or (c.space_id is not null and exists (
            select 1 from public.space_members m
            where m.space_id = c.space_id
              and m.user_id  = auth.uid()
          ))
    )
    -- Viewport cull only. This is NOT the unlock check — cairns_nearby
    -- never returns anything that needs unlocking.
    and public.distance_m(c.lat, c.lng, p_lat, p_lng) <= p_max_m
  order by public.distance_m(c.lat, c.lng, p_lat, p_lng) asc;
$$;

-- execute is granted to PUBLIC by default, and PUBLIC includes anon.
revoke execute on function public.cairns_nearby(double precision, double precision, double precision) from public;
grant  execute on function public.cairns_nearby(double precision, double precision, double precision) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- RPC 2 — cairn_detail(p_cairn_id, p_lat, p_lng)
--
-- TIER 2. The gate itself.
--
-- The caller's position is an ARGUMENT that the server checks against the
-- cairn's own stored row. No distance and no unlocked flag is ever
-- accepted from the caller — send {"unlocked": true} in the request body
-- and nothing changes, because nothing reads it. `band` is derived here.
--
--   distance > 200m           -> 'far'          stones: []
--   radius_m < distance <=200 -> 'approaching'  stubs only: id, kind,
--                                author_name, created_at, pin_count
--   distance <= radius_m      -> 'unlocked'     everything, plus paths
--
-- THE 200m -> radius BAND CARRIES NO PARTIAL DATA. There is no peaks, no
-- duration_ms, no thumbnail — those columns do not exist and nothing
-- produces them. The server has exactly two trust states, withheld and
-- released. CRN-015 synthesises the sharpening stone stack client-side
-- from the stone id (24 buckets) and maps distance to a blur radius. That
-- is a rendering trick and it is the correct rendering trick: the
-- in-between band exists so walking has something to sharpen, not so the
-- client can be trusted with more.
--
-- WHAT COMES BACK IS A PATH, NOT A URL. Fields are named audio_path /
-- image_path precisely so nobody ships one into an <Audio> source by
-- accident. The Edge Function signs them (3600s TTL, CRN-005 owns that
-- number) and adds audio_url / image_url. See 0002_storage.sql.
--
-- AND THE PATH IS DERIVED HERE, NOT READ OUT OF THE COLUMN. The column is
-- consulted only for whether it is null — i.e. "is there media at all" —
-- and the key itself is rebuilt from cairn_id/stone_id/pin_id per CRN-003.
-- This is what makes the signer safe: the thing handed to the service-role
-- key can only ever address the cairn the caller just proved they are
-- standing at, whatever string happens to be sitting in the row. Combined
-- with the write path binding the same key, the two agree by construction.
-- If they ever disagree the object simply does not resolve — which fails
-- closed, and is the correct direction to fail.
--
-- The Edge Function should assert it too, cheaply: reject any path whose
-- first segment is not the p_cairn_id it asked about (or 'briefings' for
-- the briefing) before calling createSignedUrl. Two independent checks on
-- the one operation that can leak someone else's audio is the right price.
--
-- A client can lie about its coordinates. Yes. That is one person claiming
-- to stand somewhere they do not, which is a much smaller problem than
-- every client holding every audio path at all times. Real defence needs
-- device attestation; say that in one sentence if asked and move on.
-- ---------------------------------------------------------------------

drop function if exists public.cairn_detail(uuid, double precision, double precision);

create function public.cairn_detail(
  p_cairn_id uuid,
  p_lat      double precision,
  p_lng      double precision
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- The outer edge of the blur band, from PLAN.md. Not per-cairn: only
  -- radius_m is per-cairn, because only radius_m needed widening indoors.
  c_approach_m constant double precision := 200;

  v_uid      uuid := auth.uid();
  v_cairn    public.cairns%rowtype;
  v_visible  boolean;
  v_dist     double precision;
  v_band     text;
  v_count    integer;
  v_stones   jsonb := '[]'::jsonb;
  v_briefing jsonb := null;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_lat is null or p_lng is null then
    -- Fail closed. Never compute NaN and let it pass a comparison.
    raise exception 'position required' using errcode = 'P0001';
  end if;

  select * into v_cairn from public.cairns c where c.id = p_cairn_id;

  -- MEMBERSHIP GATE (CRN-020), before anything else.
  -- Personal cairns are public and gated by proximity alone; only Space
  -- cairns are membership-scoped. See is_cairn_visible() for why.
  v_visible := found
    and (
      v_cairn.space_id is null
      or (v_cairn.space_id is not null and exists (
            select 1 from public.space_members m
            where m.space_id = v_cairn.space_id
              and m.user_id  = v_uid
          ))
    );

  if not v_visible then
    -- Same error for "does not exist" and "not yours" on purpose. A
    -- distinguishable "forbidden" confirms the cairn exists, which is the
    -- padlock leak wearing a different hat.
    raise exception 'cairn not found' using errcode = 'P0002';
  end if;

  if v_cairn.lat is null or v_cairn.lng is null then
    raise exception 'cairn has no position' using errcode = 'P0001';
  end if;

  -- Distance re-derived server-side from the cairn's own stored row.
  -- Argument order is lat-first.
  v_dist := public.distance_m(v_cairn.lat, v_cairn.lng, p_lat, p_lng);

  select count(*)::integer into v_count
  from public.stones s where s.cairn_id = v_cairn.id;

  if v_dist <= v_cairn.radius_m then
    v_band := 'unlocked';
  elsif v_dist <= c_approach_m then
    v_band := 'approaching';
  else
    v_band := 'far';
  end if;

  if v_band = 'approaching' then
    -- Stubs. Exactly five keys per stone and no others. Enough to draw the
    -- right number of blurred cards in the right order with the right
    -- bylines; not enough to reconstruct one word of content.
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',          s.id,
          'kind',        s.kind,
          'author_name', coalesce(pr.display_name, 'Walker'),
          'created_at',  s.created_at,
          'pin_count',   (select count(*) from public.pins pn where pn.stone_id = s.id)
        )
        order by s.created_at asc
      ),
      '[]'::jsonb
    )
    into v_stones
    from public.stones s
    left join public.profiles pr on pr.id = s.author_id
    where s.cairn_id = v_cairn.id;

  elsif v_band = 'unlocked' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',                 s.id,
          'kind',               s.kind,
          'author_name',        coalesce(pr.display_name, 'Walker'),
          'created_at',         s.created_at,
          'body_text',          s.body_text,
          'transcript',         s.transcript,
          -- PATHS, DERIVED (CRN-003 key layout), never echoed from the
          -- column. Null column -> null path -> no player rendered.
          'audio_path',         case when s.audio_url is null then null
                                     else s.cairn_id::text || '/' || s.id::text || '.m4a'
                                end,
          'image_path',         case when s.image_url is null then null
                                     else s.cairn_id::text || '/' || s.id::text || '.jpg'
                                end,
          'image_aspect_ratio', s.image_aspect_ratio,
          'pins', (
            select coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'id',         pn.id,
                  -- normalized 0-1, never pixels
                  'x',          pn.x,
                  'y',          pn.y,
                  'note_text',  pn.note_text,
                  'transcript', pn.transcript,
                  'unresolved', pn.unresolved,
                  -- derived: {cairn_id}/{stone_id}/{pin_id}.m4a
                  'audio_path', case when pn.audio_url is null then null
                                     else s.cairn_id::text || '/' || s.id::text
                                          || '/' || pn.id::text || '.m4a'
                                end,
                  'created_at', pn.created_at
                )
                order by pn.created_at asc  -- pin numbers 1..n derive from this
              ),
              '[]'::jsonb
            )
            from public.pins pn where pn.stone_id = s.id
          )
        )
        order by s.created_at asc  -- thread reads oldest at the bottom
      ),
      '[]'::jsonb
    )
    into v_stones
    from public.stones s
    left join public.profiles pr on pr.id = s.author_id
    where s.cairn_id = v_cairn.id;

    -- briefing audio is keyed by cairn_id — briefings has no briefing_id.
    select jsonb_build_object(
             'generated_at', b.generated_at,
             'summary_text', b.summary_text,
             'audio_path',   case when b.audio_url is null then null
                                  else 'briefings/' || b.cairn_id::text || '.m4a'
                             end
           )
    into v_briefing
    from public.briefings b
    where b.cairn_id = v_cairn.id;
  end if;
  -- 'far' falls through with v_stones = '[]' and v_briefing = null.

  return jsonb_build_object(
    'id',          v_cairn.id,
    'title',       v_cairn.title,
    'space_id',    v_cairn.space_id,
    'lat',         v_cairn.lat,
    'lng',         v_cairn.lng,
    'radius_m',    v_cairn.radius_m,
    'stone_count', v_count,
    'distance_m',  round(v_dist)::integer,
    'band',        v_band,
    'stones',      v_stones,
    'briefing',    v_briefing
  );
end;
$$;

-- `authenticated` keeps execute deliberately: the Edge Function forwards
-- the caller's JWT so that auth.uid() is still the real user, which means
-- it calls this as `authenticated` too. Revoking here would break the
-- signer, not harden it. Direct RPC access costs nothing anyway now that
-- paths are derived — a client calling this itself gets a path it cannot
-- sign, because there is no select policy on storage.objects (0002).
revoke execute on function public.cairn_detail(uuid, double precision, double precision) from public;
grant  execute on function public.cairn_detail(uuid, double precision, double precision) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- WRITE PATH — stack_stone(...)
--
-- CRN-017 owns this function; it is here because the proximity half of the
-- write gate has to exist alongside the read gate or they will disagree
-- about where you are standing. Replace it freely at 14:30 — just keep the
-- four checks and keep calling public.distance_m().
--
-- READ ACCESS IS NOT WRITE ACCESS. cairn_detail's checks do not apply to
-- inserts. A client that legitimately fetched a cairn's position from the
-- map now holds its id and could POST to it from anywhere. No policy can
-- see the device's position — so proximity arrives as an argument, here,
-- and since the direct insert policy is gone this is the ONLY door. That
-- is the difference between a check and a gate.
--
-- p_stone_id is how the upload survives the policy removal: the client
-- mints the uuid with crypto.randomUUID(), uploads to the key derived from
-- it, then calls this. Upload then insert, per CRN-017 — a stone row whose
-- path does not resolve yet renders as a broken player.
--
-- p_audio_path / p_image_path are CHECKED, NOT STORED. What lands in the
-- row is rebuilt from p_cairn_id and the stone id; a caller passing
-- anything else gets an error rather than a silently rewritten row, so an
-- upload that went to the wrong key is loud at 14:30 instead of being a
-- stone that mysteriously will not play.
-- ---------------------------------------------------------------------

-- Both signatures dropped: the 9-argument version is the one an earlier
-- run of this file left behind, and Postgres would otherwise keep it as an
-- overload for PostgREST to fail to disambiguate (PGRST203/PGRST202).
drop function if exists public.stack_stone(uuid, text, double precision, double precision, text, text, text, numeric, text);
drop function if exists public.stack_stone(uuid, text, double precision, double precision, text, text, text, numeric, text, uuid);

create function public.stack_stone(
  p_cairn_id           uuid,
  p_kind               text,
  p_lat                double precision,
  p_lng                double precision,
  p_body_text          text    default null,
  p_audio_path         text    default null,   -- object path, never a signed URL
  p_image_path         text    default null,
  p_image_aspect_ratio numeric default null,
  p_transcript         text    default null,
  p_stone_id           uuid    default null    -- client-minted; required if a path is given
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_cairn public.cairns%rowtype;
  v_id    uuid;
  v_audio text;
  v_image text;
begin
  -- 1. identity, server-side. There is no p_author_id parameter and there
  --    never will be: that would turn this into "post as anyone".
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_cairn from public.cairns c where c.id = p_cairn_id;
  if not found then
    raise exception 'cairn not found' using errcode = 'P0002';
  end if;

  -- 2. membership
  -- Personal cairns accept stones from anyone standing on them: "Anyone with
  -- access to a cairn can add a stone" (PLAN.md, Stacking). Proximity below is
  -- the real gate. Space cairns still require membership.
  if v_cairn.space_id is null then
    null;
  elsif not exists (
      select 1 from public.space_members m
      where m.space_id = v_cairn.space_id and m.user_id = v_uid) then
    raise exception 'cairn not found' using errcode = 'P0002';
  end if;

  -- 3. proximity, re-derived here. Guard nulls explicitly so a cairn or a
  --    caller without coordinates fails closed rather than comparing NaN.
  if p_lat is null or p_lng is null or v_cairn.lat is null or v_cairn.lng is null then
    raise exception 'position required' using errcode = 'P0001';
  end if;

  if public.distance_m(v_cairn.lat, v_cairn.lng, p_lat, p_lng) > v_cairn.radius_m then
    raise exception 'too far from cairn' using errcode = 'P0001';
  end if;

  -- 4. bind the storage paths to THIS cairn and THIS stone. A path is
  --    never taken on trust — it is rebuilt, and the caller's version is
  --    only compared against it.
  if (p_audio_path is not null or p_image_path is not null)
     and p_stone_id is null then
    raise exception
      'p_stone_id is required when a media path is supplied: mint it with crypto.randomUUID(), upload to that key, then call this'
      using errcode = 'P0001';
  end if;

  -- A text stone needs no id from the client; let one be minted here.
  v_id := coalesce(p_stone_id, pg_catalog.gen_random_uuid());

  v_audio := case when p_audio_path is null then null
                  else p_cairn_id::text || '/' || v_id::text || '.m4a' end;
  v_image := case when p_image_path is null then null
                  else p_cairn_id::text || '/' || v_id::text || '.jpg' end;

  if p_audio_path is distinct from v_audio then
    raise exception 'audio path must be %', v_audio using errcode = 'P0001';
  end if;
  if p_image_path is distinct from v_image then
    raise exception 'image path must be %', v_image using errcode = 'P0001';
  end if;

  -- 5. insert, author from auth.uid(), paths from step 4
  insert into public.stones (
    id, cairn_id, author_id, kind, body_text, audio_url, image_url,
    image_aspect_ratio, transcript
  )
  values (
    v_id, p_cairn_id, v_uid, p_kind, p_body_text, v_audio, v_image,
    p_image_aspect_ratio, p_transcript
  );

  return v_id;
end;
$$;

revoke execute on function public.stack_stone(uuid, text, double precision, double precision, text, text, text, numeric, text, uuid) from public;
grant  execute on function public.stack_stone(uuid, text, double precision, double precision, text, text, text, numeric, text, uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- WRITE PATH — add_pin(...)
--
-- CRN-013 owns pin placement; this is the same four checks as stack_stone
-- with the stone's cairn resolved one hop away, and it exists for the same
-- reason: the `pins insert own stone` policy it replaces could be called
-- from anywhere and could name any object path.
--
-- x and y are NORMALIZED 0-1 fractions of the image, never pixels. The
-- check constraints in 0001 already refuse a stray locationX; the explicit
-- guard here fails with a message that says which end is wrong.
--
-- Authorship, not just membership: you may pin your own photo stone. That
-- is the rule the dropped policy encoded (owns_stone) and CRN-013's flow —
-- capture, then land in the pin editor for that stone — never needs more.
-- Widening it to any member standing at the cairn is a two-line change to
-- the check below if the room wants collaborative punch lists.
-- ---------------------------------------------------------------------

drop function if exists public.add_pin(uuid, double precision, double precision, double precision, double precision, uuid, text, text, text);

create function public.add_pin(
  p_stone_id   uuid,
  p_x          double precision,
  p_y          double precision,
  p_lat        double precision,
  p_lng        double precision,
  p_pin_id     uuid default null,   -- client-minted; required if a path is given
  p_note_text  text default null,
  p_audio_path text default null,
  p_transcript text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_author   uuid;
  v_cairn_id uuid;
  v_cairn    public.cairns%rowtype;
  v_id       uuid;
  v_audio    text;
begin
  -- 1. identity
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- 2. the stone must exist and be the caller's own. Same opaque error for
  --    "no such stone" and "not yours": a distinguishable forbidden
  --    confirms the stone exists.
  select s.author_id, s.cairn_id into v_author, v_cairn_id
  from public.stones s where s.id = p_stone_id;

  if not found or v_author is distinct from v_uid then
    raise exception 'stone not found' using errcode = 'P0002';
  end if;

  select * into v_cairn from public.cairns c where c.id = v_cairn_id;
  if not found then
    raise exception 'cairn not found' using errcode = 'P0002';
  end if;

  -- 3. membership
  -- Personal cairns are public; proximity below is the real gate. Space
  -- cairns still require membership. See stack_stone() for the reasoning.
  if v_cairn.space_id is null then
    null;
  elsif not exists (
      select 1 from public.space_members m
      where m.space_id = v_cairn.space_id and m.user_id = v_uid) then
    raise exception 'cairn not found' using errcode = 'P0002';
  end if;

  -- 4. proximity, re-derived. Nulls fail closed rather than comparing NaN.
  if p_lat is null or p_lng is null or v_cairn.lat is null or v_cairn.lng is null then
    raise exception 'position required' using errcode = 'P0001';
  end if;

  if public.distance_m(v_cairn.lat, v_cairn.lng, p_lat, p_lng) > v_cairn.radius_m then
    raise exception 'too far from cairn' using errcode = 'P0001';
  end if;

  -- 5. normalized coordinates
  if p_x is null or p_y is null
     or p_x < 0 or p_x > 1 or p_y < 0 or p_y > 1 then
    raise exception 'pin coordinates must be normalized 0-1, not pixels (got x=%, y=%)', p_x, p_y
      using errcode = 'P0001';
  end if;

  -- 6. bind the path: {cairn_id}/{stone_id}/{pin_id}.m4a, rebuilt here.
  if p_audio_path is not null and p_pin_id is null then
    raise exception
      'p_pin_id is required when a media path is supplied: mint it with crypto.randomUUID(), upload to that key, then call this'
      using errcode = 'P0001';
  end if;

  -- A text pin needs no id from the client; let one be minted here.
  v_id := coalesce(p_pin_id, pg_catalog.gen_random_uuid());

  v_audio := case when p_audio_path is null then null
                  else v_cairn.id::text || '/' || p_stone_id::text || '/' || v_id::text || '.m4a'
             end;

  if p_audio_path is distinct from v_audio then
    raise exception 'pin audio path must be %', v_audio using errcode = 'P0001';
  end if;

  -- 7. insert. `unresolved` keeps its default false — CRN-013 ships no
  --    capture-side UI for it and the seed data sets the flag.
  insert into public.pins (id, stone_id, x, y, note_text, audio_url, transcript)
  values (v_id, p_stone_id, p_x, p_y, p_note_text, v_audio, p_transcript);

  return v_id;
end;
$$;

revoke execute on function public.add_pin(uuid, double precision, double precision, double precision, double precision, uuid, text, text, text) from public;
grant  execute on function public.add_pin(uuid, double precision, double precision, double precision, double precision, uuid, text, text, text) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- join_space_by_code(p_code) — CRN-019, stub-but-correct
--
-- Here because 0004's own comment above promises it exists and nothing
-- defines it, which leaves is_space_member() returning false for everyone:
-- every Space cairn invisible to every client, and stack_stone rejecting
-- every write to one. The Space half of the demo does not run without
-- this or without hand-seeded rows.
--
-- There is deliberately no `spaces` insert policy to go with it. Creating
-- a Space and generating the six-character code is CRN-018's ticket; until
-- 14:00, seed spaces from the SQL editor (service_role bypasses RLS) or
-- via CRN-027. CRN-019 may `create or replace` this freely — the contract
-- below is the one its ticket specifies.
--
-- The lookup lives in a definer function precisely because it must NOT be
-- a policy: a client that can `select * from spaces where join_code = $1`
-- can also `select join_code from spaces` and walk every Space in the
-- database.
-- ---------------------------------------------------------------------

drop function if exists public.join_space_by_code(text);

create function public.join_space_by_code(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_code  text;
  v_space public.spaces%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Uppercase, strip spaces and hyphens: ' m7k2qp ' must join.
  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));

  select * into v_space from public.spaces s where s.join_code = v_code;
  if not found then
    -- Typed failure, not null — the client maps this to "That code doesn't
    -- match a Space" and can still tell it apart from a dead network.
    raise exception 'space not found' using errcode = 'P0002';
  end if;

  -- Never 'owner', and never a user id from a parameter — that would turn
  -- this into "add anyone to any Space". Double-tap Join is a no-op.
  insert into public.space_members (space_id, user_id, role)
  values (v_space.id, v_uid, 'member')
  on conflict (space_id, user_id) do nothing;

  return jsonb_build_object(
    'id',         v_space.id,
    'name',       v_space.name,
    'accent_hex', v_space.accent_hex
  );
end;
$$;

revoke execute on function public.join_space_by_code(text) from public;
grant  execute on function public.join_space_by_code(text) to authenticated, service_role;

notify pgrst, 'reload schema';

-- CHECK AFTER RUNNING THIS FILE ---------------------------------------
-- Supabase passes RPC arguments BY NAME. supabase.rpc('cairns_nearby',
-- { p_lat, p_lng }) — the names must match exactly or you get PGRST202,
-- which reads like the function does not exist.
--
--   select * from public.cairns_nearby(46.05, 14.51);
--     as a normal user JWT: only your cairns and your Spaces' cairns.
--   select public.cairn_detail('<id>', <far lat>, <far lng>);
--     -> band 'far', stones []. Grep the raw HTTP body for '.m4a', '.jpg'
--        and a known transcript word: zero hits.
--   select public.cairn_detail('<id>', <cairn lat>, <cairn lng>);
--     -> band 'unlocked', audio_path present.
--   select * from public.stones limit 1;   via PostgREST with a user JWT
--     -> `permission denied for table stones`, not an empty array. The
--        REVOKE above changed this: it used to be zero rows (RLS with no
--        select policy), it is now denied at the privilege layer, one step
--        earlier. Either satisfies CRN-005; the error is the louder one.
--   As a NON-member of a Space, with the cairn's exact coordinates:
--     cairns_nearby omits it entirely; cairn_detail raises 'cairn not
--     found'. Test this as a different logged-in user, not by logging out —
--     logged-out fails for boring reasons and gives a false pass.
--
-- Privileges, because a missing grant looks exactly like a broken policy:
--   select grantee, table_name, privilege_type
--   from information_schema.role_table_grants
--   where grantee in ('anon','authenticated') and table_schema = 'public'
--   order by table_name;
--     -> profiles select/update, spaces select, space_members select,
--        cairns insert. Nothing else. Zero rows for anon, and no row at
--        all for stones, pins or briefings.
--
-- Write path, as a normal user JWT and NOT service_role:
--   insert into public.stones (cairn_id, author_id, kind) values (...);
--     -> permission denied. There is no direct door any more.
--   select public.stack_stone('<cairn id>', 'text', <far lat>, <far lng>,
--                             'hello');
--     -> 'too far from cairn', and `select count(*) from public.stones`
--        is unchanged. This is CRN-017's third acceptance criterion and it
--        is now the only path, not one path of two.
--
-- STILL MISSING, AND CRN-005 IS NOT DONE WITHOUT IT ---------------------
-- There is no supabase/functions/cairn-detail/ yet. SQL cannot mint a
-- signed URL, so until that Edge Function exists nothing plays at all —
-- which is the right direction to be broken in, but it is broken.
-- It must: forward the caller's Authorization header so auth.uid() stays
-- the real user, call cairn_detail, and sign ONLY when band = 'unlocked',
-- with createSignedUrl(path, 3600) on the service-role key. Paths arrive
-- derived from ids (above), so its own first-segment assertion —
-- path.split('/')[0] === p_cairn_id, or 'briefings' for the briefing — is
-- a second lock on a door that is already bolted, and worth the two lines.
-- Never persist what it returns: a stored signed URL is a permanent bypass.
