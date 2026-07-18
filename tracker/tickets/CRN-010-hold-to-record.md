---
id: CRN-010
title: Hold-to-record with stacked-stone waveform
epic: E2 Capture
priority: P0
status: todo
owner: unassigned
estimate: 45m
slot: "11:45"
depends_on: [CRN-001]
blocks: [CRN-011, CRN-017]
---

# CRN-010 — Hold-to-record with stacked-stone waveform

**Press and hold to speak, release to stop, 60s hard cap, with a live waveform that draws upward as a stack of stones instead of a bar chart.**

## Why this exists

Voice is the primitive the whole product rests on — every stone in the demo route except the photo pins is audio. The stacked-stone waveform is called out in the plan as "the detail people will remember," and it is the one piece of motion a judge watches for five uninterrupted seconds. It gets real attention, not a library default.

## Scope

- Mic permission requested on first use, with a readable denial path that returns to the capture sheet.
- Press-and-hold on the record control starts recording; release stops it. No tap-to-start / tap-to-stop mode — the gesture is the affordance.
- Hard cap at 60s: recording stops itself at 60.0s exactly as if released. Show remaining time in the last 10s.
- Release under ~400ms discards: no file kept, nothing handed on, nothing uploaded. A fumbled tap must not become a stone.
- Waveform: sample metering on a fixed interval (~80–100ms). Each sample above threshold pushes one stone onto a stack that grows **upward** from a baseline — small rounded quads, slightly varied widths, amber `#D9A441` on base `#0F1E17`. Cap the visible stack height and compress or scroll rather than overflowing the container.
- Output handed to CRN-011: the local file URI, duration in ms, and the amplitude sample array.
- Format: AAC in an `.m4a` container.

## Acceptance criteria

- [ ] Hold for 5s while speaking → a file exists at a local URI and plays back through the phone speaker at normal volume.
- [ ] Speaking in bursts adds stones only during the bursts. Two seconds of silence mid-recording adds no stones, visible on screen.
- [ ] Recording auto-stops at 60s with no user action. Resulting duration is 60s ±0.5s — not 61+, not a hang, not a stuck UI.
- [ ] A 200ms tap produces no file and no handoff. Check the app's local recordings directory is unchanged afterwards.
- [ ] The output is AAC/`.m4a`, not WAV or PCM. Size check is enough: a 10s recording is tens of KB, not multiple MB.
- [ ] Denying mic permission shows a message, returns cleanly, and leaves the record control in its idle state — not stuck mid-record.
- [ ] The waveform reads as a stack of discrete stones growing upward. It is not a symmetric mirrored audiogram and not a bar chart. Hold it next to the plan's description and it should be recognisable as the thing described.

## Not in this ticket

Upload and the `stones` row (CRN-011). Transcription. Playback of remote stones. The blurred/pixelated proximity rendering of a waveform — CRN-017 consumes this component but owns the gating. Text stones, and audio attached to photo pins.

## Notes & traps

- **Use `expo-audio`, not `expo-av`.** expo-av is deprecated and most search results you'll land on describe its `Audio.Recording` API. Following them costs 20 minutes and produces code that doesn't compile against the installed library.
- **Metering must be enabled explicitly in the recording options**, and the recorder must be *prepared* before it is started. Prepare-then-record is two separate calls. Skipping the prepare step is the classic silent failure: nothing throws, and you get an empty file.
- **Metering is dBFS, not amplitude.** The range runs roughly from a silence floor near −160/−60 up to 0 at clipping, and it is logarithmic. Normalise with something like `clamp((db + 60) / 60, 0, 1)` and then tune the push threshold against your own voice in the actual room. Feeding the raw number into a height is how you get a waveform that is either flat or permanently maxed.
- **iOS audio session:** recording requires the session to allow recording, and if you leave that mode set after stopping, playback comes out quiet or routes to the earpiece. Set the mode back when you stop. This is the "why is playback so quiet" bug and it eats half an hour because it looks like an upload problem.
- **`NSMicrophoneUsageDescription` must be in the iOS `infoPlist` of the app config.** The project is prebuilt (CRN-001), so adding it needs a native rebuild — a JS reload will not pick it up and the permission dialog will simply never appear.
- Own the sampling timer and clear it in the same function that stops the recorder. An orphaned interval keeps pushing stones onto a finished recording and the stack grows forever.
- Render the stack with plain Views or Reanimated, not a charting library. Twelve stones a second through a generic chart component drops frames on a real phone, and this is precisely the animation people are watching.
- The schema has no waveform or duration column. Pass the sample array to CRN-011 in memory so the just-recorded stone renders its real shape; remote stones get a synthetic stack derived from whatever metadata is available. Do not plan to re-analyse audio files today.
