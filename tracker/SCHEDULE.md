# Cairn — Running order, Saturday 2026-07-18

10:30 start. **15:30 freeze.** 16:30 done.

Slots are starting guns, not deadlines — see [`README.md`](README.md). Estimates inside a slot add up to more than the slot is long, because work runs in parallel and spills. **The first ticket listed in each slot is the critical path**: it gets the strongest person and it does not get interrupted.

## The table

| Slot | Tickets that start | Milestone that proves the slot succeeded |
|---|---|---|
| **10:30** | CRN-001 dev client · CRN-002 schema · CRN-003 storage · CRN-004 auth | `npx expo run:ios` has installed a custom dev client on a **physical iPhone** and it renders a screen. All seven tables exist (`select *` returns zero rows, not an error). A test file uploads to the audio bucket and comes back with a path. |
| **11:00** | CRN-006 contour base style · CRN-005 proximity gate · CRN-007 cairn glyph · CRN-008 live position | A contour-only map renders on the device at the venue's coordinates with your real blue dot on it. The nearby-cairns RPC returns rows containing lat/lng/stone_count and **no** `audio_url` or `transcript` field for a caller 500m away. |
| **11:45** | CRN-009 drop a cairn · CRN-010 hold-to-record · CRN-011 upload and appear | **Record → upload → appear on map, on a real device.** Hold the button, speak five seconds, release, and a new glyph is on the map within a few seconds without reloading the app. Second device sees the same glyph. |
| **12:30** | CRN-026 seed four-cairn route (walking, two people) · CRN-027 seed eleven-stone cairn (deskwork, in parallel — only cairn 3's coordinate blocks it) — lunch at the keyboard | Four cairns exist at real coordinates around Technology Park, walked to and verified: standing at cairn 1 the distance number reads under 30m and the audio plays. The Space cairn holds eleven stones from four authors with transcripts already populated. |
| **13:15** | CRN-013 pin placement · CRN-012 photo capture · CRN-014 torch reveal | Photograph a real radiator/panel, tap three points, reopen the stone on a **second device in a different orientation**, and the three pins sit on the same three physical features. Pin rows in Postgres have x and y between 0 and 1. |
| **14:00** | CRN-018 create Space · CRN-019 join by code · CRN-020 scoped visibility · CRN-021 theming *(cut first)* | Account B enters the six-character code, joins, and sees the Space cairn. Account C, standing on top of that cairn, sees **nothing at all** on the map — not a locked marker, not a grey glyph. Nothing. |
| **14:30** | CRN-015 blur and sharpen · CRN-016 stone thread · **CRN-023 `brief` Edge Function (server half — it needs CRN-027's transcripts, not the thread UI)** · CRN-017 stack a stone · CRN-024 nearby list | Standing 150m out, the waveform renders visibly blurred and the network response contains no audio URL. Walk in: it sharpens continuously and autoplays inside 30m. Thread renders oldest-at-bottom with author and timestamp; a new stone appears at the top of it. |
| **15:00** | CRN-023 button + TTS wiring · CRN-025 demo mode · CRN-022 live transcription *(cut on sight)* | Press **Brief me** on the eleven-stone cairn and the phone speaks a synthesis out loud, unprompted, in under fifteen seconds. Demo mode toggles on and walks the fixed route with GPS off. |
| **15:30** | CRN-028 freeze and rehearse · CRN-029 pitch script and mirroring | Freeze declared out loud. Branch tagged. The build on the demo phone is the build you will demo — nobody runs `expo run:ios` again today. |
| **15:30–16:30** | *(no new tickets)* | Three complete end-to-end runs of the four-cairn route, mirrored to the screen, pitch spoken over the top. The **third** one is clean: no crash, no reload, no "hang on". |

**The 15:00 slot is the one slot that cannot spill** — 15:30 is a freeze, not a starting gun. Anything not demonstrably working at 15:20 does not ship.

## Cut decisions, pre-made

Decisions made at 14:00 under pressure are worse than decisions made now. These are already decided. Do not reopen them at 14:00; just execute.

**1. If photo pins are not working at 14:00, cut Spaces and finish the pins.**
Mark CRN-018, CRN-019, CRN-020, CRN-021 as `cut`. Hardcode one demo Space — fixed UUID, fixed accent hex, every seeded account already a member — and spend 14:00–14:30 landing CRN-013 and CRN-014 instead. Pins are the product; Spaces are the business model. A business model can be described in a sentence on stage. A feature that does not exist cannot be.

**2. CRN-021 (Space theming) is P2 and goes first.**
It is the accent color and a wordmark. It is the first thing cut in any slot that runs long, and it is cut without discussion or a vote. If 14:00 is comfortable, it is twenty-five minutes of the highest visual return in the build — but it is never the reason 14:30 slips.

**3. CRN-022 (transcription on upload) is cuttable because CRN-027 seeds transcripts.**
The demo cairn's eleven stones already carry transcript text from the 12:30 seed, so **Brief me** works whether or not live transcription ever runs. Cut CRN-022 the moment CRN-023 is at risk. CRN-023 is P0 and CRN-022 is not; if you can only have one, you have the one that makes noise in the room.

**4. 15:30 is a hard freeze.**
No new features, no refactors, no "it's a two-line fix", no dependency installs, no rebuilds. After 15:30 the only permitted changes are: seed data corrections, hardcoded copy, and reverting something that broke. Everything else is walking the route. A feature that lands at 15:50 has been rehearsed zero times, which makes it a liability, not a feature.

**Cut order, if you need one without thinking:** CRN-021 → CRN-022 → the CRN-018/019/020 Spaces block *(only under decision 1)*. CRN-024 (Nearby) is **not** on this list — it is the fallback surface if the map misbehaves on stage. CRN-025 (demo mode) is **not** on this list — indoor GPS is the most likely thing to kill the demo and the plan says decide it at 15:00, not 16:25.

## Checkpoints

Three moments where you stop, ask one question, and answer it honestly. The value is entirely in answering "no" out loud when it is no.

### 11:00 — Does a Mapbox map render on a real device?

Not in a simulator. Not "the build is running". A map, contour lines, on a phone in your hand.

**If no:** this is the emergency, not a task. Everyone except one person on CRN-002/CRN-003 stops and works the build. Check, in this order: the secret token has `DOWNLOADS:READ` scope; it is where the native SDK download actually reads it from (`.netrc` / env, per `@rnmapbox/maps` install docs) and not only in `app.json`; the public `pk.*` token is set separately at runtime; `npx expo prebuild --clean` then `npx expo run:ios`; a 401 during the iOS dependency install is always the download token, never the code.

**Hard line at 11:15.** If nothing has rendered by 11:15, take the fallback: promote CRN-024 (Nearby) to the primary surface and demo distance-gated content as a sorted list. It is a worse demo and it is a demo. Do not spend a fourth hour on native build tooling — CRN-001 is the single most likely thing to eat an hour before noon, and the mitigation is admitting it early. Taking this fallback means CRN-024 moves from 14:30 to now and becomes P0 — update its slot and priority in BOARD.md at the same time you make the call, and drop CRN-006/CRN-007 to whatever a spare pair of hands can salvage.

### 12:30 — Is the record→upload→appear loop closed, and are the four cairns seeded before you eat?

Two questions, one gate. The seed cairns are the answer to the second one and they are not negotiable.

**If the loop is not closed:** do not start 13:15. Photo capture (CRN-012) reuses the same storage upload path as voice (CRN-011); a broken upload path will break the highest-value hour of the day too, and you will debug it twice. Fix the loop first, eat at the keyboard.

**If the cairns are not seeded:** seed them now, before lunch, and eat afterwards or not at all. It is light out, the venue is quiet, and CRN-026 requires physically standing at four locations. At 15:00 it will be neither light nor quiet, and CRN-023's whole demo beat depends on CRN-027's eleven stones already existing.

Expect this to run to 13:15. Do not serialise CRN-027 behind CRN-026: its eleven stones and SQL are written at a desk while the route is being walked, and only the `cairn_id` for cairn 3 has to arrive from the walk.

### 14:00 — Do photo pins work? *(This is the cut gate.)*

"Work" means: a photo uploads, tapping the image places a numbered pin, the pin persists with normalized coordinates, and reopening the stone puts the pin back on the same spot. Anything less than that is a no.

**If no:** execute cut decision 1 immediately. Mark the four Spaces tickets `cut` in [`BOARD.md`](BOARD.md), hardcode the demo Space, and put the whole 14:00–14:30 block on CRN-013 and CRN-014. Do not start Spaces "just in case pins come together" — that is how you arrive at 15:30 with two half-features.

**If yes:** proceed to 14:00 as scheduled, and CRN-021 is still the first thing to go.
