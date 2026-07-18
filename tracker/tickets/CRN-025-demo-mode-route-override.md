---
id: CRN-025
title: "Demo mode: fixed-route position override"
epic: E7 Surfaces
priority: P0
status: todo
owner: unassigned
estimate: 30m
slot: "15:00"
depends_on: [CRN-008]
blocks: [CRN-028]
---

# CRN-025 — Demo mode: fixed-route position override

**A toggle that replaces the device's position with a scripted walk along the four-cairn demo route, feeding the same position hook everything else already reads.**

## Why this exists

The plan, verbatim: *"If the venue's GPS is bad indoors — and it might be — have a demo mode that overrides position along a fixed route, tested and toggleable. Decide this at 15:00, not at 16:25."* Indoor GPS at a tech park drifts 30–80m and can sit still for a minute. The entire product is a proximity gate; a position that won't move is a pitch that doesn't unlock. This is the only ticket on the board whose job is to make a failure survivable, which is why a P1-shaped feature is P0.

## Scope

- A demo-mode source that emits positions into **the position hook from CRN-008**, at the hook level. Every consumer — distance labels, the CRN-005 gate call, the CRN-015 blur, the Nearby list (CRN-024), the map camera — must be unable to tell the difference.
- A hardcoded waypoint array matching the four seeded cairns from CRN-026, each with an **approach segment**: a point ~250m out, then ~150m, ~60m, then standing on it. Interpolate between waypoints at walking pace (~1.4 m/s) so distance decreases continuously.
- Manual control: step to the next waypoint, step back, pause/resume, reset to start. Thumb-reachable one-handed while the phone is mirrored — you will be holding it up and talking.
- The toggle itself lives somewhere reachable but not on the pitch surface: a long-press or triple-tap on a fixed piece of chrome, or a small dev sheet. It must not be a visible switch during the demo.
- Toggling off returns to real device position without a restart.
- Demo mode is compiled into the build you demo from. Do not put it behind a flag that requires a rebuild to flip.

## Acceptance criteria

- [ ] With the app in demo mode and iOS location permission **revoked in Settings**, the position still advances along the route and cairn 1 unlocks at the end of its approach segment.
- [ ] The network inspector shows the CRN-005 proximity RPC being called with the *demo* coordinates, and audio URLs appear in the response only once the demo position is inside 30m — the gate is still doing the work.
- [ ] Advancing through cairn 2's approach segment, the waveform/thumbnail sharpens **continuously** over several seconds. It does not jump from fully blurred to fully sharp in one frame.
- [ ] On the mirrored screen, the map's position marker sits at the demo position, not at the real GPS fix. There is exactly one dot.
- [ ] Toggling demo mode off returns to the real device position within one location update, with no reload and no crash.
- [ ] `grep` for `watchPositionAsync` / `getCurrentPositionAsync` returns hits in exactly one file — the CRN-008 hook. Any second call site is a screen demo mode does not cover.
- [ ] A teammate who did not build it can turn it on and drive the full four-cairn route with one thumb, without being told which control does what twice.
- [ ] Demo mode is working and has been walked end to end **before 15:00**, whether or not the decision is to use it.

## Not in this ticket

The seeded cairns and their real coordinates (CRN-026, CRN-027) — this ticket consumes those coordinates, it does not create them. The blur mechanic (CRN-015), the gate (CRN-005), the rehearsals (CRN-028). Route recording, GPX import, simulated heading/altitude, and anything that persists across launches.

## Notes & traps

- **The override goes inside the position hook, not at call sites.** One provider, one source of truth. If any screen calls `expo-location` directly, demo mode silently doesn't apply there and you find out on stage. Fix that screen instead of adding a second override.
- **Do not implement demo mode as "unlock everything."** It lies about *where you are*; it never bypasses the gate. The server still decides. If demo mode takes a different code path to content, then the path you rehearse is not the path that runs, and the whole point of building this is gone.
- **The map puck will betray you.** `@rnmapbox/maps` can draw the user location and follow the camera from the native SDK's own location provider, which knows nothing about demo mode — you get a real-GPS dot and a fake position at once. In demo mode, disable native user-location/follow behaviour and drive both the camera and a custom position annotation from the hook.
- Teleporting between cairns is the failure mode that looks worst. Cairn 2's approach is where the blur mechanic is sold; if the position jumps 250m → 5m in one tick the mechanic never renders. Interpolate, and make the approach segments long enough to talk over.
- Emit updates on a timer at a plausible rate (~1/s). Consumers that debounce or throttle position (the Nearby list re-sort, any RPC call guard) behave differently at 10Hz than at 1Hz, and you want the rehearsed behaviour to be the real behaviour.
- Keep an escape hatch: pause exists so that if a judge asks a question mid-route the position stops where it is rather than walking past the cairn you're talking about.
- Accuracy/timestamp fields matter — emit values shaped like the real `expo-location` object (coords with latitude, longitude, accuracy, plus a timestamp). A consumer that reads `accuracy` to decide whether to trust a fix will reject `undefined` and you'll debug it at 16:15.
- Slot says 15:00 but this is the one 15:00 ticket you are allowed to pull forward. The decision at 15:00 is only a decision if this already works — otherwise it's a gamble. Build it the moment CRN-008 is green and someone has a spare half hour.
- If GPS is fine at 15:00, walk for real. Leave demo mode built, off, and one long-press away.
