---
id: CRN-013
title: Pin placement with normalized coordinates
epic: E2 Capture
priority: P0
status: todo
owner: unassigned
estimate: 40m
slot: "13:15"
depends_on: [CRN-012]
blocks: [CRN-014]
---

# CRN-013 — Pin placement with normalized coordinates

**One line.** — Tap anywhere on a captured photo to drop a numbered pin, hold to attach a voice note or type text, and persist the pin at coordinates normalized 0–1 against the image.

## Why this exists

This is the highest-value hour of the day and the plan says so twice. It is the feature that converts Cairn from charming to useful: *the leak is there, on that valve, not somewhere in this photo.* Voice notes at a coordinate are an art project; a voice note on a specific bolt is field service software.

If it is 14:00 and this is not working, Spaces get cut and this gets finished. Pins are the product.

## Scope

- After CRN-012 uploads, land directly in the pin editor for that stone.
- Render the photo in a container locked to the stone's `image_aspect_ratio`.
- Tap the photo → a provisional numbered pin appears at the tap point immediately, before any network call.
- A sheet opens for that pin: hold-to-record a voice note, or type text. One or the other, not both required.
- Save → insert a `pins` row with `stone_id`, `x`, `y` as floats in 0–1, plus `note_text` or `audio_url`.
- Voice notes upload to the private audio bucket via the same helper CRN-012 used.
- Ship the coordinate conversion as **one shared module** (e.g. `lib/pinCoords.ts`) exporting both directions. CRN-014 imports it.
- Done → back to the cairn.

## Acceptance criteria

- [ ] Tapping the exact top-left corner of the photo stores `x < 0.05` and `y < 0.05`. Tapping the visual center stores both within 0.02 of 0.5.
- [ ] After deliberately tapping outside the photo frame and on any letterbox bars, `select count(*) from pins where x not between 0 and 1 or y not between 0 and 1` returns 0.
- [ ] Place a pin on a small distinctive feature — a screw head, a printed label. Force-quit the app, reopen, open the stone: the pin is on that same screw head, not near it.
- [ ] Open the same stone at a different render width (rotate to landscape, or open on the iPad simulator): the pins sit on the same physical features. This is the whole point of the ticket.
- [ ] A voice pin row has non-null `audio_url` pointing into the private audio bucket and the file plays back with audible content (not a 0-byte object). A text pin has `note_text` and null `audio_url`.
- [ ] Three pins placed in sequence render as 1, 2, 3 in creation order, and the same numbers appear on reopen.

## Not in this ticket

- **Editing, moving, or deleting a pin after creation.** Explicitly out of scope in the plan. If someone taps wrong, they place another pin. This constraint is why the estimate is 40m and not 90m.
- Rendering pins over a dimmed photo with the torch reveal — CRN-014.
- Transcribing pin audio — E6 owns that; just store the `audio_url` and leave `transcript` null.
- Marking a pin unresolved. No capture-side UI for it; the seed data sets that flag.

## Notes & traps

- **Kill the letterbox problem instead of solving it.** Give the photo container `{ width: '100%', aspectRatio }` using the value CRN-012 stored, and render with `contentFit="cover"` (expo-image) or `resizeMode="cover"`. When the container's aspect ratio equals the image's, cover and contain are identical, there are no bars, and the rendered frame *is* the image — so `locationX / frameWidth` is already normalized with no offset math at all. Do this first.
- **Fallback math, if you cannot lock the container** (`contentFit="contain"`, container `W`×`H`, image aspect `ar`):
  - If `W/H > ar`: `dispH = H`, `dispW = H*ar`, `offX = (W - dispW)/2`, `offY = 0`.
  - Else: `dispW = W`, `dispH = W/ar`, `offX = 0`, `offY = (H - dispH)/2`.
  - Then `nx = (locationX - offX) / dispW`, `ny = (locationY - offY) / dispH`.
  - Skipping the offset is the classic failure: pins land correct on a photo that happens to fill the frame and wrong on every other one.
- **`locationX`/`locationY` are relative to the view that handled the press.** Put the press handler on the same view whose size you measured — not on a child, not on a wrapper with padding. Get the frame from `onLayout`'s `nativeEvent.layout`, never from `Dimensions.get('window')`; the window includes safe-area chrome the photo does not occupy.
- **Clamp and reject, don't round.** Drop taps that normalize outside 0–1. Store the full float — rounding to two decimals moves a pin ~1% of the image width, which is several centimetres on a valve.
- **`expo-audio`, not `expo-av`.** `expo-av` is deprecated. The current API is hook-based (`useAudioRecorder` with `RecordingPresets`, plus `AudioModule` and `setAudioModeAsync`); verify the exact exports against the installed version rather than trusting memory.
- **iOS audio mode is a mode, and it is sticky.** You must request recording permission and set the audio mode to allow recording before `record()`. Leaving `allowsRecording: true` set afterwards makes subsequent playback quiet and routes it to the earpiece — clear it after `stop()`. Set `playsInSilentMode: true` while you are in there.
- **Reuse the hold-to-record component from CRN-009.** Do not write a second recorder at 13:40. The stack-of-stones waveform already exists.
- **`pins` has no ordering column** and does not need one — number them by `created_at` ascending at render time, `index + 1`. Do not add a column now.
- **Pin audio uploads hit the same 0-byte Blob trap as CRN-012.** Base64 → `ArrayBuffer` → `.upload()` with an explicit `contentType`.
