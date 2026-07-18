---
id: CRN-011
title: "Voice stone: upload and appear on the map"
epic: E2 Capture
priority: P0
status: todo
owner: unassigned
estimate: 30m
slot: "11:45"
depends_on: [CRN-003, CRN-009, CRN-010]
blocks: [CRN-016, CRN-022, CRN-026]
---

# CRN-011 — Voice stone: upload and appear on the map

**Close the loop: recording ends, audio lands in the private bucket, a `stones` row is inserted, and the cairn's glyph grows on the map.**

## Why this exists

This is the 11:45 milestone in the plan's build order — record → upload → appear. The afternoon assumes it is closed: photo capture reuses this exact upload path with a different bucket, and CRN-016, CRN-022 and CRN-026 all read the row shape this ticket writes. If this is not working, the day does not move on to photos.

## Scope

- On recording complete (CRN-010): insert the stone **optimistically** into the cairn's local thread and increment the glyph's stone count immediately, before any network call.
- Upload the local `.m4a` to the private audio bucket from CRN-003 under a deterministic key: `{cairn_id}/{stone_id}.m4a`.
- Insert the `stones` row: `cairn_id`, `author_id = auth.uid()`, `kind = 'voice'`, `audio_url` = the **storage key**, `created_at` default.
- On success, reconcile the optimistic entry with the real row. On failure, the stone stays visible in a terracotta `#C0563A` failed state with a Retry that re-uploads the same local file. It does not silently vanish and it does not silently succeed.
- Glyph height on the map reflects the new stone count. Positions and counts are ungated data and may go to any client — that is explicitly allowed by the plan.

## Acceptance criteria

- [ ] Record 5s at a cairn: the stone appears in the thread and the glyph grows *before* the upload finishes. Switch on airplane mode mid-upload to see the optimistic and confirmed states as two distinct things.
- [ ] After upload, the `stones` row has `kind = 'voice'` and `audio_url` holding a path like `<uuid>/<uuid>.m4a` — **not** a string beginning with `https://`.
- [ ] The uploaded object is a non-zero size in the Supabase Storage browser. A 0-byte object means the upload silently failed.
- [ ] Requesting that object's public URL form while unauthenticated returns an error, not audio. The bucket is private.
- [ ] Kill the network, record, release: the stone shows the terracotta failed state; reconnect and Retry uploads the same audio and clears the state.
- [ ] Force-quit and reopen: the stone is present exactly once. No duplicate left behind by the optimistic insert.
- [ ] Standing at the cairn, the freshly uploaded stone plays back.
- [ ] Two stones recorded back to back at one cairn produce two rows and a glyph two stones taller. Storage keys do not collide.

## Not in this ticket

Transcription (E6 reads `audio_url` afterwards). The server-side proximity gate that decides who is handed a playable URL. Blur/sharpen rendering. Photo stones and pins. Editing or deleting a stone. Any background retry queue beyond one manual Retry button.

## Notes & traps

- **Store the storage key, not a URL.** The bucket is private, so `getPublicUrl` returns a link that fails, and signed URLs expire — a long-lived signed URL in `audio_url` makes the proximity gate decorative. The gate mints a short-lived signed URL at request time, and that is the entire enforcement point of working rule 1.
- **React Native cannot upload the file as a `Blob`.** `fetch(uri).then(r => r.blob())` yields an empty or malformed body in RN and you get a 200 back with a 0-byte object — the worst failure mode, because nothing errors. Read the file to base64 with expo-file-system, decode it to an `ArrayBuffer` (`base64-arraybuffer`), and upload that. On SDK 54+ the base64 read moved to `expo-file-system/legacy`; if the import looks wrong, that's why.
- **Set `contentType` explicitly** to the m4a/AAC type on upload. Supabase defaults unrecognised uploads to `application/octet-stream` and some players refuse to open it — which presents as "the upload worked but nothing plays."
- **Generate the stone UUID on the client** so the storage key and the row id are the same value, and the optimistic entry has a stable identity through reconciliation. This deletes a whole class of duplicate-and-orphan bugs.
- **Upload first, insert second.** A row pointing at an object that never landed is invisible corruption you will find during the demo; an orphaned object in storage costs nothing.
- **Write the `stones` insert RLS policy now**, not at 14:00 when Spaces lands. It must allow insert when the author can reach the cairn — a personal cairn they own, or a cairn whose `space_id` is a Space they belong to. An insert that only works because RLS is disabled breaks the moment CRN-002's policies are switched on, and it breaks for everyone at once.
- If this loop is not closed by **12:15**, stop everything else and fix it before lunch. The rest of the build order is stacked on top of it.
