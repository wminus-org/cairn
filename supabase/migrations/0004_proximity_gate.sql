-- =====================================================================
-- CAIRN — 0004_proximity_gate.sql
-- CRN-005 (server-side proximity gate) + CRN-020 (Space-scoped
-- visibility) + the narrow write policies and the proximity-checked
-- stacking write path.
--
-- NOT EXECUTED. Run after 0003_auth.sql. Safe to re-run.
--
-- This file is the security boundary of the entire product. SECURITY
-- DEFINER bypasses RLS on every table it touches — that is the point, and
-- it also means there is no second net underneath these function bodies.
-- Everything below therefore:
--   * pins its search_path (an unpinned SECURITY DEFINER function is a
--     privilege-escalation vector and Supabase's linter flags it),
--   * schema-qualifies every identifier anyway,
--   * derives identity from auth.uid() inside the function. Position is an
--     input. Identity never is. No function here takes a user id.
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
-- ---------------------------------------------------------------------

create or replace function public.is_space_member(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
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
-- proximity. Used by the insert policies below as the floor that stops
-- cross-Space writes. Proximity cannot live in a policy at all: the
-- device's position is not a fact about the session and there is nowhere
-- for a policy to read it from. That is what stack_stone() is for.
create or replace function public.can_write_cairn(p_cairn_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.cairns c
    where c.id = p_cairn_id
      and auth.uid() is not null
      and (
        (c.space_id is null and c.created_by = auth.uid())
        or public.is_space_member(c.space_id)
      )
  );
$$;

create or replace function public.owns_stone(p_stone_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
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
-- WRITE POLICIES
--
-- Writes are the one place policies earn their keep: a client inserting
-- its own row leaks nothing, and three narrow policies are cheaper than
-- three more RPCs.
--
-- TRAP, and it will cost ten minutes: with insert-only policies,
-- supabase.from('stones').insert(row).select() FAILS — the .select() needs
-- a select policy that deliberately does not exist. Call .insert(row)
-- WITHOUT .select() and generate the row id client-side with
-- crypto.randomUUID() so you already know it.
-- ---------------------------------------------------------------------

-- spaces: you may read a Space you belong to (or created). No policy
-- exposes join_code lookup — if a client could `select * from spaces where
-- join_code = $1` it could also `select join_code from spaces` and walk
-- every Space in the database. The code lookup lives inside CRN-019's
-- SECURITY DEFINER function, where RLS does not apply.
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

-- stones: insert your own, onto a cairn you are entitled to write to.
drop policy if exists "stones insert own" on public.stones;
create policy "stones insert own"
  on public.stones
  for insert
  to authenticated
  with check (
    stones.author_id = auth.uid()
    and public.can_write_cairn(stones.cairn_id)
  );

-- stones update: needed by the documented upload order — insert the row,
-- get the uuid, upload to {cairn_id}/{stone_id}.m4a, then write the path
-- back. Author only, and the update cannot move the stone to another
-- cairn or reassign the author.
drop policy if exists "stones update own" on public.stones;
create policy "stones update own"
  on public.stones
  for update
  to authenticated
  using      (stones.author_id = auth.uid())
  with check (stones.author_id = auth.uid()
              and public.can_write_cairn(stones.cairn_id));

-- pins: hang off a stone the caller authored. x/y normalization is
-- enforced by the check constraints in 0001, not here.
drop policy if exists "pins insert own stone" on public.pins;
create policy "pins insert own stone"
  on public.pins
  for insert
  to authenticated
  with check (public.owns_stone(pins.stone_id));

drop policy if exists "pins update own stone" on public.pins;
create policy "pins update own stone"
  on public.pins
  for update
  to authenticated
  using      (public.owns_stone(pins.stone_id))
  with check (public.owns_stone(pins.stone_id));

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
set search_path = public, pg_temp
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
    and (
      (c.space_id is null and c.created_by = auth.uid())
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
set search_path = public, pg_temp
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
  v_visible := found
    and (
      (v_cairn.space_id is null and v_cairn.created_by = v_uid)
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
          -- PATHS. The Edge Function signs these into audio_url/image_url.
          'audio_path',         s.audio_url,
          'image_path',         s.image_url,
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
                  'audio_path', pn.audio_url,
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

    select jsonb_build_object(
             'generated_at', b.generated_at,
             'summary_text', b.summary_text,
             'audio_path',   b.audio_url
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
-- map now holds its id and could POST to it from anywhere. The insert
-- policy above stops cross-Space writes, but no policy can see the
-- device's position — so proximity arrives as an argument, here.
-- ---------------------------------------------------------------------

drop function if exists public.stack_stone(uuid, text, double precision, double precision, text, text, text, numeric, text);

create function public.stack_stone(
  p_cairn_id           uuid,
  p_kind               text,
  p_lat                double precision,
  p_lng                double precision,
  p_body_text          text    default null,
  p_audio_path         text    default null,   -- object path, never a signed URL
  p_image_path         text    default null,
  p_image_aspect_ratio numeric default null,
  p_transcript         text    default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_cairn public.cairns%rowtype;
  v_id    uuid;
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
  if v_cairn.space_id is null then
    if v_cairn.created_by is distinct from v_uid then
      raise exception 'cairn not found' using errcode = 'P0002';
    end if;
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

  -- 4. insert, author from auth.uid()
  insert into public.stones (
    cairn_id, author_id, kind, body_text, audio_url, image_url,
    image_aspect_ratio, transcript
  )
  values (
    p_cairn_id, v_uid, p_kind, p_body_text, p_audio_path, p_image_path,
    p_image_aspect_ratio, p_transcript
  )
  returning stones.id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.stack_stone(uuid, text, double precision, double precision, text, text, text, numeric, text) from public;
grant  execute on function public.stack_stone(uuid, text, double precision, double precision, text, text, text, numeric, text) to authenticated, service_role;

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
--     -> zero rows. The tables are not directly readable.
--   As a NON-member of a Space, with the cairn's exact coordinates:
--     cairns_nearby omits it entirely; cairn_detail raises 'cairn not
--     found'. Test this as a different logged-in user, not by logging out —
--     logged-out fails for boring reasons and gives a false pass.
