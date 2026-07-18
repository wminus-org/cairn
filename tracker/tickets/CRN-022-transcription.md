---
id: CRN-022
title: Transcription on upload
epic: E6 Intelligence
priority: P1
status: todo
owner: unassigned
estimate: 35m
slot: "15:00"
depends_on: [CRN-011]
blocks: []
---

# CRN-022 — Transcription on upload

**One line.** — Every voice stone gets transcribed by a hosted speech-to-text API after upload, asynchronously, and the text lands in `stones.transcript` (or `pins.transcript`) without the app ever waiting on it.

## Why this exists

Text under the audio is what makes a cairn searchable, skimmable, and summarizable. It is also the raw material "Brief me" reads — but only in the general case. For the demo, the winning cairn ships with seeded transcripts (CRN-027), so this ticket is a P1 that makes the product real, not a P0 the pitch depends on.

Second reason it exists: a voice note you can read is a voice note you can act on. "The leak is on the third riser" as text on a photo pin is the B2B case in one line.

## Scope

- A Supabase Edge Function `transcribe`, invoked after a voice upload completes (CRN-011).
- The function: resolves the stone/pin row → downloads the audio from Storage with the service role → POSTs the bytes to a hosted STT API → writes the returned text back to `stones.transcript` or `pins.transcript`.
- Invocation is **fire-and-forget from the client**: the app calls `supabase.functions.invoke('transcribe', { body: { kind: 'stone' | 'pin', id } })` and does **not** `await` it. The upload path completes and the cairn appears on the map regardless.
- Handles both targets: `stones` with `kind = 'voice'`, and `pins` with an `audio_url`.
- Any failure — bad key, API 500, timeout, unparseable response — is logged and swallowed. The row keeps `transcript = null` and nothing surfaces in the UI.
- The UI renders a stone with `transcript = null` as audio-only, with no spinner, no placeholder, and no empty grey box.

## Acceptance criteria

- [ ] Record a 10-second voice stone. Within 60 seconds, `select transcript from stones where id = '<id>'` returns non-null text that recognisably matches what was said.
- [ ] The cairn glyph is visible on the map, and the stone is playable, **before** `transcript` is non-null — confirmed by watching the map while the column is still null.
- [ ] Break transcription deliberately (set the STT key to garbage, redeploy). Record another stone: the upload still succeeds, the stone still appears and plays, `transcript` stays null, and no error is shown to the user.
- [ ] With transcription broken, the wall-clock time from releasing the record button to the cairn appearing on the map is the same as with it working. Time both with a stopwatch.
- [ ] Add a voice pin to a photo. `select transcript from pins where id = '<id>'` returns non-null text.
- [ ] A client that has not proven proximity never receives `transcript` in any response — check with the network inspector against a cairn 500m away.

## Not in this ticket

- "Brief me" and the summarization prompt — CRN-023, which reads `transcript` and does not depend on this ticket shipping.
- Speaker diarization, punctuation cleanup, translation, profanity filtering.
- Re-transcribing existing rows, backfill jobs, or a retry queue. One attempt, then give up.
- Showing transcripts in the stone thread UI — that is the thread ticket's call, not this one's.
- The server-side proximity gate itself. This ticket writes the column; the gate that decides who can read it lives in E0.

## Notes & traps

**Apple's on-device transcription was researched and deferred — do not reopen it today.** `expo-speech-recognition` would make this free and offline, but Slovenian is not a supported locale on either Apple speech API, and the demo reads seeded transcripts anyway, so it buys the pitch nothing. Full findings and the post-hackathon path: [`reference/on-device-ai.md`](../reference/on-device-ai.md).

**CRN-023 is deliberately NOT downstream of this ticket.** The demo cairn ships with `transcript` values written by the seed script (CRN-027). If this Edge Function is broken at 15:20, "Brief me" still works on stage. Do not let anyone wire `briefings` generation to "wait for transcription to finish" — that couples the P0 moment to a P1 network call.

**Anthropic does not do speech-to-text.** Use whichever hosted STT you already have a key for — Deepgram (`POST https://api.deepgram.com/v1/listen`, raw audio body, `Authorization: Token <key>`) or OpenAI's audio transcription endpoint (multipart with a `file` field and a model name) are both a single POST. Do not spend the 35 minutes shopping. If you have neither key at 15:00, mark this `cut` and move on — the demo does not need it.

**Edge Functions run on Deno, not Node.** `Deno.env.get('X')`, not `process.env.X`. No `fs`, no `Buffer` unless you import a shim. Read the audio as an `ArrayBuffer`/`Blob` and pass it straight through to the STT endpoint.

**Secrets.** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into the function environment automatically. Your STT key is not — set it with `supabase secrets set DEEPGRAM_API_KEY=...` before deploying, or the deployed function will 500 on first call with a null key and you will assume the audio is broken. Never ship the STT key in the app bundle; the whole reason this is a function is that the key stays server-side.

**Service role client, not anon.** The function writes to `stones`/`pins` on behalf of nobody, so RLS will reject an anon-key client. Construct the Supabase client inside the function with the service role key. That also means the function must not accept a caller-supplied `transcript` — it takes an id, fetches, and writes. Anything else is a write-anything endpoint.

**The audio bucket is private.** You cannot `fetch()` the public URL. Either use `storage.from(bucket).download(path)` with the service role client, or mint a short-lived signed URL server-side. If you get a 400 with an empty body from Storage, you are hitting the public path on a private bucket.

**JWT verification.** Edge Functions verify the caller's JWT by default. Invoking via `supabase.functions.invoke` from the app with a signed-in session works, because supabase-js attaches the session token. If you instead wire this to a Postgres trigger / Database Webhook, that request carries no user JWT — you must deploy with `--no-verify-jwt` and check a shared secret header yourself. Prefer the client-side fire-and-forget invoke; it is one line and skips this entire class of problem.

**Fire-and-forget means fire-and-forget.** In JS, an un-awaited promise that rejects is an unhandled rejection. Attach a `.catch(() => {})`. On React Native an unhandled rejection can surface as a redbox in dev, which will look like an upload failure during a rehearsal.

**Deploy it.** `supabase functions deploy transcribe`. A function that only ever ran under `supabase functions serve` on your laptop does not exist for the phone. Test the deployed URL once from the device before you believe it.

**Column names come from the plan, verbatim:** `stones.transcript`, `pins.transcript`. Do not add `transcript_status`, `transcribed_at`, or a jobs table. Null means "no transcript", and that is the entire state machine.
