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

-- INSERT: any authenticated user may upload into either bucket.
-- Anonymous sign-in (CRN-004) still carries the `authenticated` role, so
-- this covers every real demo user. Do not add a check on
-- (auth.jwt() ->> 'is_anonymous') — that locks out everybody.
drop policy if exists "cairn media insert" on storage.objects;
create policy "cairn media insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id in ('cairn-audio', 'cairn-images'));

-- UPDATE: own objects only, so `upsert: true` can overwrite a
-- half-uploaded object on retry. Without this, a retry after a failed
-- upload 403s and reads in RN as an unhelpful "Network request failed".
drop policy if exists "cairn media update own" on storage.objects;
create policy "cairn media update own"
  on storage.objects
  for update
  to authenticated
  using      (bucket_id in ('cairn-audio', 'cairn-images') and owner = auth.uid())
  with check (bucket_id in ('cairn-audio', 'cairn-images') and owner = auth.uid());

-- DELETE: own objects only. Cleanup of a bad take, nothing more.
drop policy if exists "cairn media delete own" on storage.objects;
create policy "cairn media delete own"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id in ('cairn-audio', 'cairn-images') and owner = auth.uid());

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
-- The honest limit of this design: paths are UUID-derived and therefore
-- unguessable, and a scraped signed URL dies in an hour. It is not a
-- capability system. What it does guarantee is that the network payload
-- for a far-away cairn contains nothing playable, which is the property a
-- judge with a proxy open is actually checking.

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
