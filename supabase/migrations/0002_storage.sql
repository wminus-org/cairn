-- =====================================================================
-- CAIRN — 0002_storage.sql
-- CRN-003. Two PRIVATE buckets and their storage.objects policies.
--
-- NOT EXECUTED. Run after 0001_schema.sql, in the Supabase SQL editor.
-- Safe to re-run: buckets upsert, policies are dropped and recreated.
--
-- The whole point of this file, in one sentence: CRN-005 keeps audio paths
-- away from clients that have not proven proximity, and that guarantee is
-- worth nothing if the object itself sits behind a permanent public URL.
-- The key layout below is deterministic and derivable from ids alone —
-- every client legitimately knows cairn ids — so a public bucket means
-- anyone can guess the path and stream a voice note from a hundred
-- kilometres away. Private buckets are not a precaution here, they are the
-- other half of the gate.
-- =====================================================================

-- Buckets -------------------------------------------------------------
-- public = false on both. The `on conflict` clause deliberately FORCES it
-- back to false on every re-run: if someone ticks "Public bucket" in the
-- dashboard at 13:00 to make debugging easier, re-running this file
-- un-ticks it. That toggle otherwise never gets un-ticked.
--
-- Key layout (CRN-003 owns this; CRN-011 and CRN-012 must not invent a second):
--   cairn-audio   {cairn_id}/{stone_id}.m4a           voice stone
--   cairn-audio   {cairn_id}/{stone_id}/{pin_id}.m4a  pin note
--   cairn-audio   briefings/{cairn_id}.m4a            briefing TTS
--                 (keyed by cairn_id — briefings has no briefing_id)
--   cairn-images  {cairn_id}/{stone_id}.jpg           photo stone
insert into storage.buckets (id, name, public)
values ('cairn-audio', 'cairn-audio', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public)
values ('cairn-images', 'cairn-images', false)
on conflict (id) do update set public = false;

-- Policies on storage.objects -----------------------------------------
-- storage.objects already has RLS enabled by Supabase and is owned by
-- supabase_storage_admin, so there is deliberately no `alter table ...
-- enable row level security` here — that statement would fail with
-- "must be owner of table objects". Creating policies is permitted.
--
-- Postgres has no `create policy if not exists`, so: drop, then create.

-- INSERT: an authenticated user may upload only under a cairn-id prefix.
-- Anonymous sign-in (CRN-004) still carries the `authenticated` role, so
-- this covers every real demo user. Do not add a check on
-- (auth.jwt() ->> 'is_anonymous') — that locks out everybody.
--
-- The bucket_id check alone is NOT enough, and this was the hole: keys are
-- a pure function of ids the server hands out (see the note at the bottom
-- of this file), so `with check (bucket_id in (...))` lets any signed-in
-- user write ANY key in either bucket. Two concrete attacks, both real:
--   1. POISONING. Plant an object at {cairn_id}/{stone_id}.m4a for a cairn
--      you cannot see. The signer will happily sign it for whoever does
--      unlock that cairn, and they hear your audio, not the author's.
--   2. DENIAL OF THE REAL UPLOAD. Objects at not-yet-used keys belong to
--      the planter, so the legitimate upload from a different user later
--      403s against "cairn media update own" below — and CRN-011 surfaces
--      that in RN as "Network request failed", at 15:00, on stage.
--
-- The uuid regex on the first path segment does two jobs: it forces the
-- {cairn_id}/... layout, and it keeps clients out of the `briefings/`
-- prefix entirely. Briefing audio is written by the generator on the
-- service-role key, which bypasses RLS and this file, so no client ever
-- needs to write there.
drop policy if exists "cairn media insert" on storage.objects;
create policy "cairn media insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id in ('cairn-audio', 'cairn-images')
    and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
  );

-- STILL MISSING HERE, AND IT MUST LAND IN 0004: the predicate above pins
-- the SHAPE of the key but not WHOSE cairn it is. A member of Space A can
-- still write under a cairn id belonging to Space B. Closing that needs
-- public.can_write_cairn(uuid), which is a SECURITY DEFINER function
-- created in 0004_proximity_gate.sql — i.e. AFTER this file. Calling it
-- here is a forward reference: `create policy` analyses its expression at
-- creation time, so this whole file would abort with "function
-- public.can_write_cairn(uuid) does not exist" and you would be debugging
-- SQL at 10:35 with no buckets. Do not "fix" it by pasting a copy of the
-- helper into this file either — two definitions of one authorisation
-- rule is how they drift.
--
-- So 0004 must re-create this policy, after the helper exists, as:
--
--   drop policy if exists "cairn media insert" on storage.objects;
--   create policy "cairn media insert"
--     on storage.objects
--     for insert
--     to authenticated
--     with check (
--       bucket_id in ('cairn-audio', 'cairn-images')
--       and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
--       and public.can_write_cairn(split_part(name, '/', 1)::uuid)
--     );
--
-- The regex is what makes the ::uuid cast safe — it runs first and stops
-- a non-uuid first segment from erroring the cast. Keep both.

-- UPDATE: own objects only, so `upsert: true` can overwrite a
-- half-uploaded object on retry. Without this, a retry after a failed
-- upload 403s and reads in RN as an unhelpful "Network request failed".
--
-- Match on BOTH owner and owner_id. `owner` (uuid) is the legacy column;
-- current storage-api writes `owner_id` (text) and on several releases
-- leaves `owner` NULL on newly created objects. `NULL = auth.uid()` is
-- NULL, never true — so an owner-only policy silently 403s every retry
-- and every cleanup delete, which is precisely the failure these two
-- policies exist to prevent. Checking both is correct on any storage-api
-- version and costs nothing.
drop policy if exists "cairn media update own" on storage.objects;
create policy "cairn media update own"
  on storage.objects
  for update
  to authenticated
  using      (bucket_id in ('cairn-audio', 'cairn-images')
              and (owner = auth.uid() or owner_id = auth.uid()::text))
  with check (bucket_id in ('cairn-audio', 'cairn-images')
              and (owner = auth.uid() or owner_id = auth.uid()::text));

-- DELETE: own objects only. Cleanup of a bad take, nothing more.
drop policy if exists "cairn media delete own" on storage.objects;
create policy "cairn media delete own"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id in ('cairn-audio', 'cairn-images')
         and (owner = auth.uid() or owner_id = auth.uid()::text));

-- SELECT: THERE IS NO SELECT POLICY, AND THAT IS THE FEATURE.
-- Not for authenticated, not for anon. A client cannot download, list, or
-- getPublicUrl its way to an object. If reads feel hard, that is the gate
-- working.
--
-- WHERE SIGNING HAPPENS: SQL cannot mint a signed URL, and letting the app
-- call createSignedUrl itself would defeat everything — it would sign any
-- path it can name, and every client can name a path. So:
--   1. public.cairn_detail() (0004) returns object PATHS, and only in the
--      'unlocked' band.
--   2. A thin Edge Function forwards the caller's JWT (so auth.uid() is
--      still the real user), calls the RPC, and then — holding the
--      service-role key, which bypasses RLS and this file entirely —
--      signs only the paths that came back.
--   3. The client calls the Edge Function. Never the detail RPC directly,
--      and never Storage directly.
-- TTL is 3600s and CRN-005 owns that number. Sign at request time, re-mint
-- on screen focus, never store a signed URL in a table — a stored signed
-- URL is a permanent bypass.
--
-- TREAT PATHS AS PUBLIC KNOWLEDGE. An earlier version of this comment
-- claimed paths are "UUID-derived and therefore unguessable" and rested
-- the model on that. It is false, and it is false BY DESIGN:
-- cairns_nearby() publishes cairn.id to every member at any distance, and
-- cairn_detail()'s 'approaching' band deliberately publishes stone.id
-- (0004) — and the key convention at the top of this file is a pure
-- function of exactly those two ids. So every path for every cairn a
-- caller can see is fully derivable at 200 m, in the band that is
-- supposed to carry no content. Path secrecy protects nothing against any
-- Space member.
--
-- The consequence, and it is the whole point: THE SIGNER IS THE ONLY
-- CONTROL. It therefore must NOT sign whatever path it is handed. It must
-- re-derive trust itself — recompute the caller's distance server-side,
-- or sign only paths that a same-request cairn_detail() returned with
-- band = 'unlocked'. A signer that signs its input is a public bucket
-- with extra steps.
--
-- Adding a random per-object suffix ({cairn_id}/{stone_id}-{random}.m4a)
-- would break derivability, but that is defence in depth and NOT a
-- substitute for validating in the signer. It also costs you the
-- deterministic key, so it is not worth it today.
--
-- What this design does guarantee, and it is worth having: the network
-- payload for a far-away cairn contains nothing playable, and a scraped
-- signed URL dies in an hour. That is the property a judge with a proxy
-- open is actually checking. It is not a capability system.

-- CHECK AFTER RUNNING THIS FILE ---------------------------------------
--   select id, public from storage.buckets where id like 'cairn-%';
--     -> two rows, public = false on both. Check it, do not assume it.
--   From the app with the anon/authenticated key:
--     storage.from('cairn-audio').download(path)  -> permissions error
--     getPublicUrl(path) pasted into a browser    -> error, not a file
--   With the service key: createSignedUrl(path, 60) -> streams, then 400
--   after 60s. That proves the signing mechanism; CRN-005 wires it in.
--   First real upload: check the byte size in the dashboard. A 0-byte or
--   44-byte object is the classic RN upload failure and it passes every
--   other check.
--   Key-shape gate, from the app with an authenticated session:
--     upload to 'briefings/<any-uuid>.m4a'  -> RLS violation, not success
--     upload to 'notauuid/x.m4a'            -> RLS violation, not success
--     upload to '<cairn_id>/<stone_id>.m4a' -> succeeds
--   If the first two succeed, the insert policy did not take — re-check
--   that this file ran without error rather than shipping it.
