---
id: CRN-001
title: Expo scaffold and Mapbox custom dev client
epic: E0 Foundation
priority: P0
status: todo
owner: unassigned
estimate: 40m
slot: "10:30"
depends_on: []
blocks: [CRN-006, CRN-010]
---

# CRN-001 — Expo scaffold and Mapbox custom dev client

**Stand up the Expo app, install the native deps, and get a blank Mapbox map rendering on a physical iPhone through a custom dev client.**

## Why this exists

`@rnmapbox/maps` ships native code. Expo Go cannot load it — not with a flag, not with a workaround. The app must be prebuilt into a custom dev client before anyone can write a line of feature code. Every map ticket (`CRN-006`), the live position hook (`CRN-008`) and the cairn glyph layer (`CRN-010`) sit behind this.

The failure mode is not "this ticket is late." The failure mode is that the Mapbox native SDK download 401s at 10:50, someone spends fifty minutes on tokens, and the map first renders at 12:15 with the whole day shifted behind it. **If it is 11:00 and a map has not rendered on a real device, stop what you are doing and put a second person on it.**

## Scope

1. `npx create-expo-app` — TypeScript template. Set `ios.bundleIdentifier` in app config immediately; prebuild fails without it.
2. Install deps. Use `npx expo install` (not raw npm) so versions match the SDK: `@rnmapbox/maps`, `expo-location`, `expo-audio`, `expo-camera`, `expo-blur`, `expo-speech`, `expo-image`, `expo-image-manipulator`, `expo-file-system`, `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, `react-native-url-polyfill`, `base64-arraybuffer`. Install the whole list now even though nothing imports half of it yet — see the traps.
3. Move config to `app.config.js` so tokens come from `process.env` and never land in git.
4. Add the `@rnmapbox/maps` config plugin with the **secret download token** (`sk.*`, `DOWNLOADS:READ` scope) in its plugin options. Add the `expo-location`, `expo-camera` and `expo-audio` plugins with their iOS permission strings while you are in there — retrofitting an `Info.plist` string later means another prebuild.
5. `npx expo prebuild --platform ios --clean`, then `npx expo run:ios --device` against a plugged-in iPhone.
6. One screen: full-bleed `MapView` with a `Camera` centred on Technology Park. Nothing else.
7. Commit `.env.example` with both token names and empty values. Do not commit `.env`.

## Acceptance criteria

- [ ] `npx expo run:ios --device` builds and installs on a physical iPhone; the app launches without a redbox.
- [ ] A Mapbox map fills the screen and responds to pan and pinch on that physical device. Tiles are visible — a grey rectangle is a failure, not a pass.
- [ ] The app opens from the home screen icon with Metro running, i.e. it is a dev client, not a one-shot build.
- [ ] `npx expo install` has been run once with the complete dependency list from every P0 ticket; no ticket after 11:00 requires a new native module.
- [ ] `grep -r "sk\." --include="*.json" --include="*.js" --include="*.ts"` over the repo returns nothing outside `.env`.
- [ ] `git status` is clean of `.env`, and `ios/` is either committed deliberately or gitignored deliberately — decided, not accidental.
- [ ] A second person can run `npm install && npx expo prebuild --platform ios && npx expo run:ios --device` from a fresh clone with their own `.env` and reach the same map.

## Not in this ticket

Contour styling and the custom map style (`CRN-006`). Live user position and the follow camera (`CRN-008`). Cairn glyphs (`CRN-010`). Supabase client wiring beyond installing the package. Auth. Anything Android — `npx expo prebuild --platform ios` only, and if someone runs a bare `prebuild` and generates an `android/` folder, delete it.

## Notes & traps

- **Two tokens, two different jobs.** The public token (`pk.*`) is a runtime value passed to `Mapbox.setAccessToken(...)` before the first `MapView` mounts. The secret token (`sk.*`, scope `DOWNLOADS:READ`) is a **build-time** credential the CocoaPods install uses to fetch the native SDK from Mapbox's private registry. They are not interchangeable. Create both at account.mapbox.com now — the secret token is shown exactly once, so paste it into `.env` before you close the tab.
- The download token goes into the `@rnmapbox/maps` config plugin options in your app config (the key is the plugin's download-token option — check the version's README rather than guessing), and/or a `machine api.mapbox.com` entry in `~/.netrc`. A `401 Unauthorized` during `pod install` means the download token is missing, mistyped, or lacks `DOWNLOADS:READ`. It is never a network problem, and re-running the command does not help.
- **Put the token in `app.config.js` via `process.env`, not in `app.json`.** The config plugin serialises whatever literal string it is given straight into the native project. Hardcoding the `sk.*` token in `app.json` is how it ends up on GitHub.
- Config plugins only take effect during prebuild. Changing a permission string, a plugin option, or the bundle id and then hot-reloading does nothing. Re-run `npx expo prebuild --clean`.
- **Physical device, not the simulator.** The whole product is distance from a coordinate. `--device` requires an Apple developer team on the target and a trusted profile on the phone; a free personal team works but the app expires in seven days, which is fine for today. Do the codesigning dance now, not at 13:00 with a camera ticket half-written.
- iOS needs `NSLocationWhenInUseUsageDescription`, `NSMicrophoneUsageDescription` and `NSCameraUsageDescription`. A missing usage string is not a permission prompt that gets denied — it is an instant silent crash the moment the API is touched.
- If the map is black or the app crashes on mount under a recent SDK, suspect the New Architecture before you suspect your code. Flip `newArchEnabled` in the app config, `prebuild --clean`, rebuild, and note which setting worked in the ticket. Do not spend more than fifteen minutes on this — pick whichever config renders tiles and move on.
- `pod install` on a cold CocoaPods cache is slow. Start the first `prebuild` running and read `PLAN.md` while it works; do not sit and watch it.
- **Install every native dep now, including the ones nothing imports yet.** This is the only prebuild slot on the board. `expo-blur` is the whole of `CRN-015`'s blur mechanic; `expo-speech` is `CRN-023`'s "Brief me" playback; `expo-image-manipulator` is `CRN-012`'s mandatory downscale; `expo-file-system` plus `base64-arraybuffer` are the base64 read that keeps `CRN-003`/`011`/`012` from silently uploading 0-byte files; `expo-image` is `CRN-013`'s `contentFit="cover"`. As `CRN-014` puts it, adding a native module after prebuild "means another `expo prebuild` and a full native rebuild" — and those two tickets land at 14:30 and 15:00, on the features that carry the pitch. Thirty seconds of `expo install` now buys back half an hour then.
- supabase-js in React Native needs `import 'react-native-url-polyfill/auto'` at the top of the client module and AsyncStorage passed as the auth storage with `detectSessionInUrl: false`. Wiring the client itself is `CRN-004`'s problem, but installing the two packages here saves a second prebuild.
