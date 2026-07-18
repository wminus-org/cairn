# Scope & Risks

What we are deliberately not building, and what is most likely to break between now and the stage.

Build day: **10:30 → 16:30**, freeze **15:30**. Every deadline below is a wall-clock time, not a vibe. If a deadline passes with the risk unresolved, take the mitigation and stop thinking about it.

---

## Part 1 — Out of scope

From `PLAN.md`: *"Cut without discussion if you're behind."* These are already decided. Do not re-open them mid-build; if someone proposes one of these at 13:00, point at this table.

| Cut | Why |
|---|---|
| **Trails** (ordered sequences of cairns) | Marked stretch in the plan. Adds an ordering model and a second map mode for zero demo seconds. |
| **Offline sync** | Every demo beat runs against live Supabase. Offline means a local store, a merge strategy, and conflict rules — a day of work that the audience cannot see. |
| **Voice anonymization** | Pitch never claims it. Audio processing on device is a rabbit hole with no visible payoff. |
| **Push notifications on geofence entry** | See the callout below. The single biggest time sink on the board. |
| **Android** | iOS-first is the stack decision. One device, one build, one `npx expo run:ios`. The demo phone is an iPhone. |
| **Photo pin editing after creation** | Pins are create-only. Edit means selection state, drag handles, and an update path against normalized coordinates. Placing pins is the demo; changing them is not. |
| **Comment reactions** | Stacking already is the collaborative act. Reactions add a table and a render path and say nothing new. |
| **Search** | The map and the Nearby list (`CRN-024`) are the two ways to find a cairn. A third one is a text-input feature nobody will type into on stage. |

### The one that will try to seduce you

**Notification-on-arrival.** "Your phone buzzes when you walk near a cairn" is the most natural-sounding feature in the product and it is the biggest trap on this board.

- Background location on iOS is its own universe: `Always` authorization (a separate, second permission prompt from `When In Use`), background modes in the entitlements, region monitoring limits, and a system that will simply decline to wake your app on the schedule you expect. Budget two hours; it will take longer.
- It requires a rebuild of the native project to change entitlements, so it drags `CRN-001` back into play.
- **It does not appear in a stage demo.** You are holding the phone, mirrored to a screen, walking toward a cairn you dropped yourself. There is no moment where a lock-screen banner adds anything the map already shows.

If asked in Q&A: it's a two-line answer — "geofence notifications are the obvious next build; we skipped them because they're an OS integration, not a product question."

---

## Part 2 — Risk register

### Lookup table

| # | Risk | Probability | Blast radius | Decision deadline |
|---|---|---|---|---|
| R1 | Mapbox custom dev client won't build | **High** | Everything | **11:00** |
| R2 | Bad indoor GPS at the venue | Medium-high | Proximity unlock, the whole mechanic | **15:00** |
| R3 | Venue wifi too slow, uploads stall on stage | Medium | Any live capture beat | 12:30 test → **15:00** commit |
| R4 | Map misbehaves live | Medium | Demo surface only | **16:00** (after 2nd rehearsal) |
| R5 | Live transcription fails | Medium | Brief me, pin notes | **15:20** |
| R6 | LLM call slow or failing on stage | Medium | The "Brief me" moment | **15:30** (freeze) |
| R7 | Phone mirroring fails at the venue | Medium | The entire pitch | **15:45** (1st rehearsal) |
| R8 | Battery | Low, but fatal | The entire pitch | **15:30** |

---

### R1 — Mapbox custom dev client won't build

The highest-probability failure of the day. Owned by `CRN-001`.

- **Trigger:** `npx expo prebuild` or `npx expo run:ios` fails. Most commonly the native Mapbox SDK download 401s during `pod install`, because `@rnmapbox/maps` needs a **secret** token with `DOWNLOADS:READ` scope in addition to the public `pk.*` token. Also: CocoaPods not installed, Xcode command-line tools not selected, no signing team on the device build.
- **Impact:** Total. There is no map, no camera, no location, no app. Expo Go **cannot** run this project — `@rnmapbox/maps` is native code, and so are `expo-camera` and `expo-location` in practice. There is no fallback path that keeps the current stack.
- **Mitigation:** Front-load it. Nobody writes a feature until the dev client is on the physical iPhone showing a map tile. Two tokens, not one: `pk.*` public token for runtime, `sk.*` secret token with `DOWNLOADS:READ` for the SDK download (`~/.netrc` or the environment variable the plugin config expects — check the `@rnmapbox/maps` install docs, don't guess the key name). Generate both from the Mapbox account page *before* touching the terminal. Build to a real device, not just the simulator — the simulator will not surface signing or location problems.
- **Deadline: 11:00.** If the map has never rendered on the physical device by 11:00, this is the emergency and everyone is on it. Do not let one person quietly fight CocoaPods until noon while the others build against a map that doesn't exist.

### R2 — Bad indoor GPS at the venue

- **Trigger:** Standing at a seeded cairn, the reported distance is 80m instead of 4m, or drifts by tens of metres while stationary. Concrete, steel, and being indoors will do this.
- **Impact:** The proximity unlock never fires. The core mechanic — blur sharpening as you close, autoplay inside 30m — is exactly what the pitch is about, and it silently doesn't happen in front of judges.
- **Mitigation:** **Demo mode (`CRN-025`).** A toggle that overrides reported position with a fixed route of hardcoded coordinates matching the four seeded cairns, stepped manually. It must go through the same code path that real location does, so the server-side gate still runs and nothing about the demo is faked below the position source. Build it, then *test it* — an untested demo mode is a second risk, not a mitigation.
- **Also:** request permission with the highest accuracy your location config allows, and give the fix a few seconds to settle before reading distance — the first coordinate `expo-location` hands you is usually a coarse cached one. Watch position continuously rather than polling once on screen mount.
- **Deadline: 15:00.** Walk the route, read the real distances, and decide then whether the demo runs on real GPS or demo mode. **Not at 16:25.** Deciding late means demoing an untested toggle under lights.

### R3 — Venue wifi stalls an upload on stage

- **Trigger:** A voice stone or photo takes more than a few seconds to upload to Supabase Storage. Hackathon wifi at 16:00 with 200 laptops on it is not the wifi you tested on at 11:00.
- **Impact:** A dead spinner during the live-capture beat. Worse than a missing feature, because the room watches it not happen.
- **Mitigation:** (a) All four demo cairns are seeded and their media uploaded **before 12:30** — the plan's schedule exists for this reason. Nothing the demo *depends on* is uploaded live. (b) The judge cairn is dropped that morning, not on stage. (c) Carry a phone hotspot and test the full route on it. (d) Cap voice at 60s and keep audio settings modest — a high-bitrate 60s clip is far more upload than the demo needs.
- **Deadline:** Test upload latency on venue wifi at **12:30** while seeding. Commit to wifi-or-hotspot by **15:00** and rehearse on whichever you picked. Do not switch networks between rehearsal and the real run.

### R4 — The map misbehaves live

- **Trigger:** Blank tiles, style fails to load, glyphs render off-position, camera won't follow the user, a crash on the map screen.
- **Impact:** Contained, *if* there is another surface. Fatal if the map is the only way to reach a cairn.
- **Mitigation:** **Nearby list (`CRN-024`)** — cairns sorted by distance, contents hidden, grouped by Space. The plan explicitly names it as "the fallback demo surface if the map misbehaves." It must be reachable in one tap from wherever the demo starts, and it must be walked at least once during rehearsal so it isn't cold when you need it. Everything the map does for the pitch, Nearby also does: shows what's near, shows how far, opens the cairn.
- **Deadline: 16:00.** After the second rehearsal walk, call whether the map or Nearby is the primary surface for the real run. If the map has failed on any of the rehearsal passes, lead with Nearby and mention the map in passing. A working list beats a flaky map on a projector.

### R5 — Live transcription fails

- **Trigger:** Transcription returns empty, errors, or takes 30 seconds for a 15-second clip. Could be the provider, the audio format, the Edge Function, or the network.
- **Impact:** Voice stones show no transcript, and "Brief me" has nothing to synthesize from — so R5 taking out R6 is the real danger.
- **Mitigation:** **Seeded transcripts (`CRN-027`).** Every demo stone has its `transcript` column populated at seed time, written by hand, before lunch. The demo never depends on a transcription round-trip completing while judges watch. Live transcription runs on stones created *during* the demo, and if it lags, nothing on the route breaks.
- **Deadline: 15:20.** If a freshly recorded stone has not produced a transcript by 15:20, stop debugging it and confirm every seeded stone has its transcript text. The freeze is 15:30 and this is the sort of bug that eats the rehearsal hour.

### R6 — LLM call slow or failing on stage

- **Trigger:** "Brief me" is pressed and the model call takes 20 seconds, rate-limits, or errors. Also: the demo phone's ring switch is on silent and iOS plays nothing through the default audio session, so the text exists but nothing speaks.
- **Impact:** This is *the* moment of the pitch — eleven stones, four people, three months, one button, and the room goes quiet while the phone talks. A spinner here is the worst possible failure on the whole route.
- **Mitigation:** **Cached briefing (`CRN-023`).** The cached artifact is `briefings.summary_text` — text, not audio. Pre-generate it by pressing **Brief me** once on the meeting-room cairn before you walk on stage, per CRN-023's traps. "Brief me" reads the cached row if one exists and only calls Claude when it doesn't. Speech is on-device `expo-speech`, so the stage path has no model call and no network in it at all. Cloud TTS is explicitly out (`CRN-023`, *Not in this ticket*) and `briefings.audio_url` stays null — nobody is generating briefing audio today. Generation stays real and works live; it is simply not on the critical path at 16:15.
- **Deadline: 15:30 (freeze).** The cached briefing must exist and must have been *spoken end to end on the demo phone with the ring switch on silent* before the freeze. "The row is in the database" is not verification; hearing it come out of the speaker with the switch flipped is.

### R7 — Phone mirroring fails at the venue

- **Trigger:** The venue's projector is HDMI and you brought a Lightning/USB-C adapter for a different port; AirPlay needs a receiver that isn't there or is on a network that blocks it; screen mirroring works but the aspect ratio crops the top of the UI; a notification banner lands mid-pitch.
- **Impact:** Total, and it is a pure logistics failure — the software works and nobody sees it.
- **Mitigation:** Bring the cable *and* the adapter. Test on the actual venue setup, not a lookalike. Enable Do Not Disturb / Focus on the demo phone and lock rotation. Have a rehearsed verbal path for a 30-second mirroring outage — you are walking and talking anyway; the pitch survives a dead screen better than a dead app.
- **Deadline: 15:45 — the first rehearsal walk.** Rehearsal #1 runs on the real projector with the real cable. If mirroring has not been tested on venue hardware by the end of the first walk, it is untested.

### R8 — Battery

- **Trigger:** Continuous GPS with a high accuracy setting, the map rendering, the camera, screen mirroring, and screen brightness at max for six hours. The demo phone is doing every expensive thing iOS offers, simultaneously.
- **Impact:** The phone dies or drops into Low Power Mode during the pitch. Low Power Mode throttles background work and location updates, so it can degrade the proximity mechanic before it kills the phone outright.
- **Mitigation:** Demo phone on a charger from **15:30** through the rehearsal hour. Carry a power bank and a cable to the stage. Do not use the demo phone for anything else — no Slack, no photos, no tethering. Second charged iPhone with the dev client installed if one exists.
- **Deadline: 15:30.** At freeze, the demo phone goes on the charger and stays there between rehearsal walks.

---

## The pre-made cut

From `PLAN.md`, decided in advance so it doesn't get argued at 14:05:

> **If it is 14:00 and photo pins aren't working, cut Spaces to a hardcoded demo team and finish the pins.**

The reasoning, so nobody re-derives it under pressure: **pins are the product; Spaces are the business model, and a business model can be described in a sentence while a feature cannot.** "The leak is *there*, on that valve" is a thing you have to show. "Cairns can be scoped to a company team with a per-Space accent color" is a thing you can say in eight seconds while walking.

**What "cut Spaces to a hardcoded demo team" means concretely:** one Space row seeded in the database with its accent colour set, the demo accounts already members of it, and the app reading that ID from a constant. No create-Space screen, no six-character join-code flow, no membership UI. The meeting-room cairn still renders in the Space accent and still looks like a team product on the map — the visible half survives, the flow that nobody watches goes.

Mark the cut tickets `cut`, not deleted. At 16:30 you want to be able to say what you chose not to build.
