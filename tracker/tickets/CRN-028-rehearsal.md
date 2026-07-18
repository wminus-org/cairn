---
id: CRN-028
title: Freeze and three full rehearsals
epic: E8 Demo
priority: P0
status: todo
owner: unassigned
estimate: 60m
slot: "15:30"
depends_on: [CRN-025, CRN-026, CRN-027]
blocks: []
---

# CRN-028 — Freeze and three full rehearsals

**One line.** — At 15:30 the code stops changing, and the route gets walked end to end three times on the demo device, mirrored, with the phone in exactly the state it will be in at 16:30.

## Why this exists

The plan gives the last hour to walking the route three times. Every single time — that is the wording and it is not padding. The failures this hour catches are not code failures. They are auto-lock, a notification banner across the mirrored screen, an expired session on cold start, Precise Location silently off, a cairn that unlocks in the car park and not in the stairwell. None of those are visible from a laptop and all of them end a demo.

The freeze is the other half of the same ticket. After 15:30 every code change has an unbounded tail: an edit needs a rebuild, a rebuild can fail, and a build that lands at 16:20 has been rehearsed zero times. A bug worked around in the script costs one sentence. A bug fixed at 16:05 can cost the whole thing.

## Scope

**The freeze, at 15:30 sharp.**

- The build currently installed on the demo device is the build that gets demoed. Tag the commit (`git tag demo-freeze && git push --tags`) so there is an unambiguous line.
- No new features, no "quick fixes", no refactors, no dependency changes, no schema changes, no Edge Function redeploys. A one-line change is still a rebuild.
- The only permitted code action after 15:30 is reverting to the frozen tag if someone has already broken it.
- Seeded demo data (CRN-027) is frozen too. Do not re-seed, do not rename a Space, do not regenerate a join code.

**Device state — set once, verify before every run.**

- Charged above 80%, on a charger between runs, Low Power Mode **off**.
- Auto-Lock: **Never**. Focus/Do Not Disturb **on**. Ring/silent switch to silent.
- Orientation locked to portrait. Brightness up (mirroring plus outdoor sun).
- Location Services → Cairn: **While Using** and **Precise Location on**.
- Microphone and Camera permissions already granted — no first-run prompt during the demo.
- Signed in, session valid, no login screen on launch.

**Contingency checks — each one exercised at least once.**

- **Cold start.** Force-quit the app and relaunch. A demo that only works on a warm app is not a demo. Do this at the top of run 2.
- **Network.** Run once on venue wifi and once on LTE. Toggle airplane mode on and off before a run and confirm the app recovers rather than sitting on a dead map.
- **Demo mode both ways.** Run the route with demo mode (CRN-025) **off**, on real GPS, and once with it **on**. Both must reach all four cairns. Know which switch you are flipping and where it lives on screen.
- **Mirroring**, on the venue's actual screen and actual cable — mechanics and fallbacks are CRN-029, but the confirmation happens here, during a real run.

**The three runs.**

| Time | Run | Emphasis |
|---|---|---|
| 15:35 | 1 | Real GPS, warm app, venue wifi. Find the breakage. |
| 15:55 | 2 | Cold start, LTE, mirrored, spoken aloud with the CRN-029 words and a timer. Screen-record this one. |
| 16:15 | 3 | Full dress. Demo mode as decided. No talking about it afterwards. |

Every run is the whole route: entrance cairn → corridor/stairwell photo-pin cairn → meeting-room Space cairn with "Brief me" → the stage cairn. Not a spot-check of the tricky bit.

**Bug protocol after the freeze.** Write it on the list. Decide the workaround, put the workaround in the script, tell whoever is speaking. Do not open the editor.

## Acceptance criteria

- [ ] `git log` shows zero commits touching app code after the `demo-freeze` tag, and the app bundle installed on the demo device at 16:30 is the one installed before 15:35.
- [ ] Three complete end-to-end runs are logged with start time, end time, and pass/fail per cairn. Three, not two.
- [ ] On the demo device: Auto-Lock reads `Never`, Low Power Mode is off, Focus is on, and Precise Location for Cairn reads on. Verified by opening Settings, not from memory.
- [ ] A full run completes with zero notification banners, zero incoming-call screens, and no volume HUD appearing on the mirrored output.
- [ ] Run 2 begins with a force-quit and cold launch: the app opens straight to the map with a valid session, no login screen, no permission prompt, and the entrance cairn unlocks within 15s of standing at it.
- [ ] One complete run finishes on LTE with venue wifi disabled, including audio playback and "Brief me".
- [ ] All four cairns are present at their real coordinates and unlock while physically standing at each — confirmed with demo mode off.
- [ ] The same four unlock in order with demo mode on, without moving, and toggling it back off returns the app to real GPS without a restart.
- [ ] A screen recording of one complete successful run exists on the device and is copied to a second machine.
- [ ] Every post-freeze bug appears on the list with a written workaround, and the count of post-freeze code commits is zero.
- [ ] Device is above 80% battery at 16:25.

## Not in this ticket

- The words, the timing, and the mirroring hardware — CRN-029.
- Seeding the four cairns and their content — CRN-026 and CRN-027.
- Building or wiring the demo-mode override — CRN-025.
- Fixing anything found during rehearsal. That is the point of the ticket.

## Notes & traps

- **A dev-client build needs Metro.** If the app on the device was launched from `npx expo run:ios` in debug, a cold start will red-screen the moment the laptop sleeps, joins a different network, or gets a new IP. If you want a genuinely cold-startable demo you need a Release build (`npx expo run:ios --configuration Release`) with the JS bundled into the binary — that takes 10+ minutes and can fail, so it is a **15:00 decision, before the freeze**, not a 15:40 one. If you stay on the dev client: laptop lid open, plugged in, Metro running, same network, and never let it sleep.
- **Low Power Mode overrides Auto-Lock: Never** and dims the screen. iOS also offers to enable it automatically at 20%. Keep it on a charger between runs and decline that prompt.
- **Focus/DND does not stop everything.** Time-sensitive alerts, calls from Favourites, and the volume HUD all still render, and AirPlay mirrors them. Silent switch on, Focus on, and if you can bear it, put the demo phone in Airplane + wifi for the run where you are not testing LTE.
- **Precise Location off is the silent killer.** Coarse mode gives you kilometre-scale accuracy and nothing will ever unlock, with no error message anywhere. Check the toggle explicitly.
- **A reinstall resets every permission.** If anyone reinstalls the app after the freeze, you get the location, mic, camera and notification prompts back on stage. This is one more reason not to touch the build.
- **Signed URL TTLs.** If audio URLs are minted with a short expiry, the ones your 15:35 run warmed will be dead by 16:20. Confirm the TTL comfortably exceeds an hour, or that each unlock re-mints. Nothing about this is visible until playback silently fails.
- **Supabase sessions expire and refresh on launch.** A cold start with a stale access token can produce one failed request before the refresh lands — which reads on stage as "the cairn didn't open". Test it in run 2, not on stage.
- **Warm the Mapbox tile cache** on the actual route. `@rnmapbox/maps` caches tiles it has already fetched; a first-ever load of the venue's tiles on bad wifi gives you a blank base with cairns floating on nothing. Runs 1 and 2 do this for you as long as you walk the whole route.
- **GPS indoors is the known enemy.** Expect drift near the building and in the stairwell. If a cairn refuses to unlock at its real coordinate on two consecutive runs, that is the demo-mode decision, not a radius-tuning task — do not go and edit `radius_m` after 15:30.
- **Battery burns fast** with continuous location watching, mirroring, screen at full brightness, and the camera. Three runs plus the real thing is roughly an hour of that. Charger between every run, without exception.
- **Time each run against the CRN-029 script.** If the walk consistently overruns, the fix is cutting a beat, not walking faster — a rushed walk desyncs from the unlock distances and you end up talking over a cairn that has not opened yet.
- **The person who wrote the code should not be the only one who has held the phone.** Whoever presents does at least one full run themselves, including the "Brief me" press.
