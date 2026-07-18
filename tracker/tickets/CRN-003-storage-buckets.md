---
id: CRN-003
title: Storage buckets and upload paths
epic: E0 Foundation
priority: P0
status: todo
owner: unassigned
estimate: 20m
slot: "10:30"
depends_on: [CRN-002]
blocks: [CRN-011, CRN-012]
---

# CRN-003 — Storage buckets and upload paths

**Two private Supabase Storage buckets, a deterministic key convention, insert-only policies for authenticated users, and no client-side read path at all.**

## Why this exists

`CRN-005` keeps audio URLs and transcripts away from clients that haven't proven proximity. That guarantee is worthless if the underlying object is sitting behind a permanent public URL. A public bucket plus the deterministic key convention below means anyone who can see a cairn id — which every client can, by design — can guess the audio path and stream it from a hundred kilometres away.

So: the buckets are private, clients never hold a durable object URL, and the only way to hear a stone is a short-lived signed URL minted server-side after the distance check passes. This is the same rule as `CRN-005`, expressed in storage. Voice recording upload (`CRN-011`) and photo capture upload (`CRN-012`) both land here.

## Scope

1. Create two buckets, both **private**:
   - `cairn-audio` — voice stones, pin notes, generated briefing audio.
   - `cairn-images` — photos attached to photo stones.
2. Key convention, deterministic and derivable from ids alone:
   - `{cairn_id}/{stone_id}.m4a` in `cairn-audio`
   - `{cairn_id}/{stone_id}.jpg` in `cairn-images`
   - pin note audio: `{cairn_id}/{stone_id}/{pin_id}.m4a`
   - briefing audio: `briefings/{cairn_id}.m4a` — `briefings` is keyed by `cairn_id`, there is no `briefing_id`
3. RLS policies on `storage.objects`:
   - `insert` allowed to `authenticated` for both buckets.
   - `select` granted to **nobody**. Not authenticated, not anon.
   - Optionally `update`/`delete` limited to `owner = auth.uid()` so a retry can overwrite a half-uploaded object.
4. A single shared upload helper in the app that takes a local file URI, a bucket and a key, and returns the storage path. Both `CRN-011` and `CRN-012` call it. Set `contentType` explicitly and `upsert: true`.
5. Confirm the server-side signing path works: with the service key, mint a signed URL for an uploaded object with a short TTL (60s) — this step only proves the signing mechanism; the production value is `CRN-005`'s 3600 — and fetch it. `CRN-005` owns wiring this into the gate; this ticket proves the mechanism.

## Acceptance criteria

- [ ] Both buckets show as private in the Storage dashboard. The public toggle is off for each — check it, do not assume it.
- [ ] An authenticated client uploads a recorded `.m4a` and the object appears at `{cairn_id}/{stone_id}.m4a` with a **non-zero byte size** in the dashboard.
- [ ] Playing back the uploaded object downloaded via a signed URL produces audible audio, not silence — a 0-byte or 44-byte file is the classic RN upload failure and it passes every check except this one.
- [ ] A `storage.from('cairn-audio').download(path)` call from the client with the anon/authenticated key fails with a permissions error.
- [ ] Pasting the object's `getPublicUrl` result into a browser returns an error, not a file.
- [ ] A signed URL minted with the service key streams the file in a browser, and returns an expiry error after its TTL has passed.
- [ ] The bucket names and the key convention are written down in `reference/data-model.md` so `CRN-011` and `CRN-012` don't invent two different ones.

## Not in this ticket

The proximity check itself and the Edge Function that mints signed URLs on demand — that is `CRN-005`. Recording UI (`CRN-011`), camera UI (`CRN-012`), pin placement, briefing TTS audio generation. Image resizing or compression: iPhone JPEGs are a few MB, the venue wifi will cope, and nobody in the audience can see the difference.

## Notes & traps

- **Do not tick "Public bucket" to make debugging easier.** It will not get un-ticked. If reads are hard, that is the feature working.
- **The React Native upload trap, and it is the expensive one:** passing `{ uri, type, name }` or a `File`-ish object to supabase-js `.upload()` in RN commonly produces a 0-byte object that uploads "successfully". The reliable pattern is to read the local file as base64 (`expo-file-system`) and pass a decoded `ArrayBuffer` / `Uint8Array` to `.upload()`. Verify the byte size in the dashboard after your very first upload — before building any UI on top of it.
- **Always set `contentType` explicitly** (`audio/m4a` or `audio/mp4` for the expo-audio output, `image/jpeg` for photos). Without it objects land as `application/octet-stream` and iOS playback may refuse them, which reads as "my recording is broken" when the recording is fine.
- `expo-audio` on iOS writes to a temporary cache directory and the returned URI includes the `file://` scheme. Strip or keep the scheme according to what your file-read API expects, and copy or upload before anything clears the cache.
- Storage policies live on `storage.objects`, a table you do not own — write them in SQL in the same migration style as `CRN-002` rather than clicking through the dashboard, so they are in the repo. `bucket_id = 'cairn-audio' and auth.role() = 'authenticated'` is the shape of the insert policy.
- Signed URLs are created with the **service key inside an Edge Function**, never in the app. If the app can mint its own signed URLs, the gate is client-side again and `CRN-005` was pointless.
- Signed-URL TTL is **3600 seconds**, set in `CRN-005` which owns that number — long enough to survive the rehearsal-to-pitch gap `CRN-028` warns about. The gate protects path discovery, not the object.
- The key convention requires the `stone_id` to exist before the upload. Insert the `stones` row first, get the uuid back, then upload to that path, then update the row with the path. If you upload first you will end up generating client-side uuids and reconciling them, which is fifteen minutes you do not have.
- Upload failures in RN often surface as an unhelpful `Network request failed`. Check bucket name spelling and the session before you go looking for anything more interesting.
