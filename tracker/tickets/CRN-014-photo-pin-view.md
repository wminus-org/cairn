---
id: CRN-014
title: Photo pin view with torch reveal
epic: E2 Capture
priority: P0
status: todo
owner: unassigned
estimate: 45m
slot: "13:15"
depends_on: [CRN-013]
blocks: []
---

# CRN-014 — Photo pin view with torch reveal

**One line.** — Read-only viewer for a photo stone: full-bleed image dimmed to 60%, numbered amber pins, and tapping one lifts a card from the bottom while the photo brightens around that pin only.

## Why this exists

CRN-013 makes pins real; this is where they're *seen*. The torch reveal is the visual signature of the B2B half of the demo — the audience is looking at a radiator on the projector and one bolt lights up while a technician's voice explains it. That is the fifteen seconds that sells "stand in front of the valve, hear everything anyone has ever said about that valve."

Terracotta for unresolved is the other half: demo cairn 2 has an unresolved flag, and it has to be visible from the back of the room.

## Scope

- Photo rendered full-bleed in a container locked to `image_aspect_ratio`, same as CRN-013.
- A black overlay at 40% opacity over the image, giving the 60% dim.
- Pin markers positioned from normalized coordinates using the **shared helper from CRN-013** — small circles, `#D9A441` amber, with the pin number in `#0F1E17`. A pin flagged unresolved renders `#C0563A` terracotta.
- Tap a pin: a card animates up from the bottom with the note text, author, and timestamp; its audio starts playing.
- Torch: a full-brightness copy of the image, clipped to a circle centered on the selected pin, composited over the dimmed base.
- Tapping the same pin again, or outside the card, deselects: card down, torch off, uniform dim returns, playback stops.
- Add `unresolved boolean not null default false` to `pins` if CRN-003 didn't include it. Nothing in the capture UI sets it; the seeded demo pin does.

## Acceptance criteria

- [ ] With no pin selected the photo is uniformly dim — screenshot it and confirm there is no bright patch anywhere.
- [ ] Tapping pin 2 produces a bright circular region whose **center** is the pin 2 marker, not its edge. Verify on both a portrait and a landscape photo.
- [ ] Place three pins with note text "one", "two", "three". Tapping each raises a card showing the matching text. Nothing shows "one" when you tapped pin 3.
- [ ] Pin audio begins within 1s of the tap, with no second press required.
- [ ] Audio is audible with the iPhone's ring/silent switch set to **silent**.
- [ ] The unresolved pin renders terracotta and the others amber, distinguishable in a screenshot on the projector — not just verifiable in code.
- [ ] Deselecting returns the screen to uniform dim and stops playback. Tapping between two pins quickly never leaves two voices playing at once.
- [ ] Pins land on the same image features here as they did in the CRN-013 editor. If they don't, the two copies of the coordinate math have drifted.

## Not in this ticket

- Placing, editing, or deleting pins. Read-only surface.
- The proximity gate that decides whether this screen gets a signed image URL at all — E3 owns that.
- Transcript display or "Brief me" — E6.
- Soft/feathered torch edges, if it costs a native dependency. Explicitly a stretch, see below.

## Notes & traps

- **Import the coordinate helper from CRN-013. Do not re-derive the math.** If the two copies drift, pins render off the feature they were placed on and it will look like a placement bug in a ticket that has already been closed.
- **The torch, concretely.** Inside the aspect-locked photo frame (`W`×`H`), with the selected pin at `cx, cy` and radius `R`:
  1. Base `<Image>` filling the frame.
  2. `<View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: 0.4 }]} />`.
  3. A clip view: `{ position:'absolute', left: cx-R, top: cy-R, width: 2*R, height: 2*R, borderRadius: R, overflow: 'hidden' }`.
  4. Inside it, a **second copy of the same image** at `{ position:'absolute', left: -(cx-R), top: -(cy-R), width: W, height: H }`.

  That negative offset is the entire trick — it puts the bright copy back in register with the base. Get it wrong and the torch shows the wrong region of the photo, which looks broken from the back of the room. Add a 1px amber ring on the clip view and a hard-edged circle reads as a torch.
- **Soft edges cost more than they're worth today.** A proper radial falloff means `react-native-svg`'s `<Mask>` + `<RadialGradient>`, or `expo-blur` — both are native modules, and adding one after prebuild means another `expo prebuild` and a full native rebuild. Cheap approximation if you have five minutes: stack two or three concentric clip circles at `R`, `1.2R`, `1.4R` with the dim stepping 0.1 → 0.25 → 0.4. Ship the hard circle first.
- **Dim with a black overlay, not `opacity` on the Image.** Setting `opacity: 0.6` on the image composites it against the `#0F1E17` base and the photo turns green-grey. A black layer at 0.4 keeps the colours.
- **`playsInSilentMode: true` in the audio mode config, or the phone plays nothing on stage** with the hardware switch flipped. This is the single most common way this category of demo dies. Also clear `allowsRecording` — if CRN-013's recorder left it set, playback comes out of the earpiece at low volume.
- **One player at a time.** Switching pins must stop the previous player before starting the next. Two overlapping voice notes in front of judges is unrecoverable.
- **The image source is a signed URL from the server-side gate**, not a URL you construct from the storage path. Signed URLs expire — if this screen can sit open for several minutes during a pitch, request a fresh one on mount rather than reusing one fetched at app start.
- **Don't add an animation dependency now.** If Reanimated is already in the tree, use it. If not, RN core `Animated` with `useNativeDriver: true` on `translateY` is enough for a card sliding up, and costs no rebuild.
