---
id: CRN-008
title: Live position and follow mode
epic: E1 Map
priority: P0
status: todo
owner: unassigned
estimate: 25m
slot: "11:00"
depends_on: [CRN-006]
blocks: [CRN-009, CRN-015, CRN-025]
---

# CRN-008 — Live position and follow mode

**One line.** — Foreground location permission, one shared high-accuracy position watch, the user drawn on the map, and a camera that follows until you pan away.

## Why this exists

This is the single source of truth for "where am I," and three separate things depend on it: the drop-a-cairn button uses it as the coordinate, the distance sort in Nearby uses it, and the proximity gate call sends it to the server. If each of those starts its own watch you get three permission races, three inconsistent positions, and a battery curve that matters across a 60-minute demo window. One hook, one subscription.

## Scope

- Request **foreground** location permission via `expo-location` (`requestForegroundPermissionsAsync`), with the iOS usage-description string set in `app.json` so it survives prebuild.
- A single `watchPositionAsync` subscription at high accuracy with a small distance interval (~5m), started once and owned by one module — not by a component that can mount twice.
- A `useCurrentPosition()` hook exposing `{ coords: { latitude, longitude, accuracy } | null, permissionStatus, lastFixAt }`, backed by that one subscription. Every consumer reads through the hook.
- The user rendered on the map (`UserLocation` from `@rnmapbox/maps`).
- Camera follows the user by default; panning the map releases follow; a recenter control re-engages it.
- A visible, non-blocking state when permission is denied or no fix has arrived yet.

## Acceptance criteria

- [ ] On a **fresh install**, opening the map shows the iOS permission dialog containing the project's own usage string — not a blank or generic one.
- [ ] Denying permission leaves the app fully usable: contours render, cairn glyphs render, and a specific "location unavailable" state is shown. No crash, no infinite spinner, no empty screen.
- [ ] Walking ~30m outdoors moves the user dot and the camera follows with no manual input.
- [ ] **Exactly one active watch.** Log a counter in the watch callback, then navigate map → Nearby → cairn detail → back to map three times. The tick rate does not increase and the counter does not restart.
- [ ] Panning the map away from the dot stops the camera fighting the gesture; the recenter control returns to follow.
- [ ] The current `accuracy` in metres is readable somewhere in a dev build (log line or debug overlay).
- [ ] Backgrounding the app for 30s and returning still yields fresh fixes without a restart.

## Not in this ticket

- **Background location, geofence entry, `Always` permission, background modes.** Explicitly out of scope in the plan — it eats two hours and never appears on stage.
- Distance calculation and the blur/sharpen render — CRN-015.
- The proximity gate RPC itself — E0. This ticket produces the coordinate that gets sent; it does not send it.
- Demo mode / fixed-route position override — CRN-025. Design the hook so a fake source can be swapped in behind it, but do not build the override here.
- Heading/compass rotation. The dot doesn't need to know which way you're facing today.

## Notes & traps

- **`NSLocationWhenInUseUsageDescription` must be set in `app.json`** (via the `expo-location` config plugin or `ios.infoPlist`), not by hand-editing the generated `Info.plist` — the next `npx expo prebuild` wipes hand edits. If the string is missing, the dialog **never appears** and the permission request resolves as denied with no error. Silent failure. If nobody is being asked for permission, check this first.
- **Do not add `NSLocationAlwaysAndWhenInUseUsageDescription`.** Adding it invites you to use it, and using it is the two-hour hole the plan warns about.
- **Double permission prompt:** Mapbox's `UserLocation` can trigger its own native location request. Request through `expo-location` first and only render `UserLocation` once permission is granted, or the user sees two dialogs and the demo audience sees you fumble.
- **Coordinate order, again:** `expo-location` returns `{ latitude, longitude }`; Mapbox wants `[longitude, latitude]`. Convert at exactly one boundary — inside the hook — and never again.
- **Clean up the subscription.** `watchPositionAsync` resolves to an object with a `remove()` method. Under React 18 strict-mode double-mounting in dev you *will* create two watches if the start/stop lives naively in a `useEffect`. Owning the subscription at module scope with a refcount is the boring, correct answer at this hour.
- **Indoor accuracy will break the 30m gate.** A venue-indoors fix can report 50–165m accuracy. The gate in E0/E3 is server-side and correct; the *input* may be garbage. Surface `accuracy` now so that at 15:00, when you're deciding whether to enable demo mode (CRN-025), you're looking at a number instead of guessing.
- **The simulator has no GPS.** Xcode's Debug → Simulate Location or a `.gpx` route will move a fake dot, which is fine for wiring but proves nothing about the demo. Test on a real device, outside, on foot, before 12:30.
- Use the highest accuracy tier for navigation. Balanced/low accuracy on iOS can return fixes coarse enough that a 30m geofence is meaningless.
- Don't set the distance interval to 0 or 1m — you'll get a callback storm and re-render the whole map on every tick. ~5m is enough to make the dot feel live while walking.
