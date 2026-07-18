-- Fix the storage policies so an upload actually succeeds, and close the
-- authorization hole 0002 flagged and 0004 never got to.
--
-- THE BUG THIS FIXES, reproduced against the live project:
--   The client uploads with `upsert: true` (supabase-js sends `x-upsert: true`).
--   storage-api then requires UPDATE on storage.objects as well as INSERT.
--   The old UPDATE policy required `owner = auth.uid()`, but on a first write
--   there is no row yet and `owner` is NULL, so `NULL = auth.uid()` is NULL —
--   never true. Every first upload of every recording was denied with
--   "new row violates row-level security policy". Text stones were unaffected
--   because they never upload, which is exactly how it presented: text worked,
--   voice did not.
--
-- THE HOLE THIS CLOSES:
--   0002's insert policy pinned the SHAPE of the key but not WHOSE cairn it is,
--   and said the real check "MUST land in 0004" once can_write_cairn() existed.
--   It never landed — can_write_cairn was defined, granted, and called by
--   nothing. Any authenticated user could write objects under any cairn id they
--   could read off cairns_nearby. Now the first path segment must be a cairn
--   the caller can actually write to.
--
-- Note on ownership: we deliberately do NOT key these on `owner`. Beyond the
-- NULL problem above, `owner` is the legacy column — current storage-api writes
-- `owner_id` (text) and leaves `owner` NULL on new objects. Authorization here
-- comes from the cairn, not from who happened to upload first. can_write_cairn
-- is SECURITY DEFINER with an empty search_path and encodes the real rule:
-- personal cairns are public, Space cairns require membership.

-- The cairn id is the first path segment. Inlined rather than wrapped in a
-- helper because Supabase does not grant CREATE on the `storage` schema, and a
-- helper in `public` would be one more thing to keep in step with the key
-- layout in CRN-003.
--
-- The regex is anchored, so `briefings/...` (written by the service role, which
-- bypasses RLS anyway) cannot match, and neither can a traversal attempt.

drop policy if exists "cairn media insert" on storage.objects;
create policy "cairn media insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id in ('cairn-audio', 'cairn-images')
    and (
      case
        when name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
        then public.can_write_cairn((split_part(name, '/', 1))::uuid)
        else false
      end
    )
  );

-- UPDATE exists so `upsert: true` works. That matters for more than tidiness:
-- the stone id is minted client-side BEFORE the upload, so a retry re-uploads
-- the same file to the same key rather than stranding an orphan object under a
-- fresh id. Same predicate as insert — if you may write the cairn, you may
-- replace your own object under it.
drop policy if exists "cairn media update own" on storage.objects;
create policy "cairn media update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id in ('cairn-audio', 'cairn-images')
    and (
      case
        when name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
        then public.can_write_cairn((split_part(name, '/', 1))::uuid)
        else false
      end
    )
  )
  with check (
    bucket_id in ('cairn-audio', 'cairn-images')
    and (
      case
        when name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
        then public.can_write_cairn((split_part(name, '/', 1))::uuid)
        else false
      end
    )
  );

drop policy if exists "cairn media delete own" on storage.objects;
create policy "cairn media delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id in ('cairn-audio', 'cairn-images')
    and (
      case
        when name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
        then public.can_write_cairn((split_part(name, '/', 1))::uuid)
        else false
      end
    )
  );

-- Still NO select policy, deliberately. Reads happen through server-minted
-- signed URLs after the proximity gate has run. A client that could select
-- storage.objects could sign any path it can derive, and both ids in the key
-- are published at 200m by design — that is the whole bypass 0004 closed.
