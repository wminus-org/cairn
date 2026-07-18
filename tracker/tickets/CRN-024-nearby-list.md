---
id: CRN-024
title: Nearby list
epic: E7 Surfaces
priority: P1
status: todo
owner: unassigned
estimate: 30m
slot: "14:30"
depends_on: [CRN-005]
blocks: []
---

# CRN-024 — Nearby list

**A distance-sorted list of cairns, grouped by Space, contents hidden, that renders correctly with Mapbox never loaded.**

## Why this exists

Feature 7 in the plan: a genuinely useful surface for someone who wants to know what's around them without staring at a map. It is also the stage insurance. If the contour style fails to load, the dev client drops the native module, or the map renders a grey rectangle at 16:10, this is the screen you pitch from — same data, same gate, same distance numbers, zero Mapbox. That second job is why a P1 gets built on time.

## Scope

- A `Nearby` screen reachable from the map in **one tap** — a persistent control in the map chrome, not inside a menu or a settings sheet.
- Data comes from the same server-side proximity RPC as CRN-005, list-safe payload only: cairn id, title, stone count, space id / name / accent hex, distance in metres. Do not request or accept audio URLs, image URLs or transcripts on this screen.
- Sections: one per Space the account belongs to, plus a `Personal` section. Section header is the Space name with a small swatch in that Space's accent (`spaces.accent_hex`), falling back to amber `#D9A441` for Personal.
- Within a section, ascending distance. Row = title (or `Untitled cairn`), the stone-count glyph from CRN-007 reused at row height, and the distance in mono 11pt with letterspacing, right-aligned.
- Tapping a row opens the same cairn detail as tapping a glyph on the map (the thread from CRN-016). If detail isn't merged yet, make the row a no-op and ship the list.
- Pull to refresh. Empty state reads as one line of copy on the base colour, not a spinner forever.
- Flip one constant to make Nearby the app's initial route — this is how you demo without the map at all.

## Acceptance criteria

- [ ] Launching the app straight into Nearby (initial route flipped) renders real rows from the server, and the map screen is never mounted. Nothing in this screen's import graph pulls `@rnmapbox/maps`.
- [ ] Reachable from the map in exactly one tap, and back to the map in exactly one tap.
- [ ] Rows are strictly ascending by distance inside each section; standing at the demo route's cairn 1, cairn 1 is the first row of its section.
- [ ] Signed in as an account that is **not** a member of the seeded Space, the Space cairn does not appear in the list while standing within 50m of it — no row, no section, no placeholder.
- [ ] With the app 300m from every cairn, the network response backing this list contains no `audio_url`, `image_url` or `transcript` value for any cairn. Check in the network inspector, not by reading the code.
- [ ] The distance shown for a given cairn matches the number on the map glyph for the same cairn to within 1m.
- [ ] Walking 20m updates every distance number without rows re-ordering under an in-progress scroll.
- [ ] With location permission denied, the screen still renders the cairn list with `—` in place of distances instead of an error or a blocked state.

## Not in this ticket

Map glyphs and the map itself (CRN-006, CRN-007), the blur/sharpen mechanic (CRN-015), the stone thread (CRN-016), Space creation and joining (CRN-018, CRN-019), the demo position override (CRN-025). Search, filtering and Trail ordering are out of scope per the plan.

## Notes & traps

- **Distance is the server's number.** Do not haversine on the client "just for the list" — you will ship two slightly different distances for the same cairn on two screens and one of them will be on the mirrored display. Take `distance_m` from the CRN-005 RPC response.
- Use `SectionList`, not `FlatList` with manual headers. Turn `stickySectionHeadersEnabled` off — sticky headers read as a social app, and the design is a field journal.
- Re-sorting on every `expo-location` tick makes rows swap under the user's thumb. Recompute the ordering at most every ~3s, or only when the device has moved more than ~10m, and freeze order while a scroll gesture is active.
- Never gate this screen behind a location permission prompt or a "waiting for GPS" state. A fallback surface that can fail is not a fallback. No fix → unsorted list, `—` for distance.
- The RPC takes the caller's position as arguments. Agree the null-position contract with whoever owns CRN-005 *before* writing the call — the server should return cairns with a null distance rather than erroring. Do not invent a second RPC for this screen.
- "Contents hidden" is literal: no waveform, no thumbnail, no transcript snippet, not even a blurred one. Blur belongs to the map (CRN-015). A row shows that something is there and how far away it is. Nothing else.
- This screen reads the shared position hook from CRN-008, so it inherits demo mode (CRN-025) for free — as long as you consume the hook and never call `expo-location` directly here.
- Section order on stage: put the Space that owns the demo cairn first, `Personal` after it. Cheapest possible way to make the B2B story the first thing on screen.
