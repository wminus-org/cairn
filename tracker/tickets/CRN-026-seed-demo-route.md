---
id: CRN-026
title: Seed the four-cairn demo route
epic: E8 Demo
priority: P0
status: todo
owner: unassigned
estimate: 45m
slot: "12:30"
depends_on: [CRN-011]
blocks: [CRN-027, CRN-028, CRN-029]
---

# CRN-026 — Seed the four-cairn demo route

**Walk Technology Park with a phone and drop the four cairns the pitch is built on, recording the exact coordinate of each one back into this file.**

## Why this exists

The demo is a walk. The walk needs cairns that already exist at real coordinates with real audio recorded in the real place. None of that can be manufactured from a desk at 15:00 — you cannot fake standing outside the entrance, and a voice note recorded at a table sounds like a voice note recorded at a table.

It is scheduled at 12:30 for three reasons: it is light, the venue is quiet, and nobody is panicking yet. By 15:00 all three are false.

Everything downstream needs the coordinates this ticket produces. `CRN-025`'s route override needs them as waypoints, `CRN-027` seeds into cairn 3, `CRN-028` walks the route, `CRN-029` scripts against it.

## Scope

Seed through the **app**, not SQL. Use the drop-a-cairn flow from `CRN-009` and the upload from `CRN-011`. If a cairn cannot be created through the UI, that is a `CRN-011` bug found at 12:30 instead of 15:40, which is the second reason this ticket is early.

**1 — Outside the entrance.** Personal cairn (`space_id` null). One voice stone, 12–20 seconds, warm, first person, addressed to whoever comes next. Not a product description. This is the entire emotional case and the room decides in the first fifteen seconds.

**2 — Corridor or stairwell.** Personal cairn. One photo stone of an *actual* radiator, control panel, riser or fire door — something you can physically point the camera at again on stage while the pins are on screen. Frame it so three distinct features are visible and separated: the pins need somewhere to go. Take the photo now; **you come back at 13:15 and place the three pins yourself** — see the second pass below.

**3 — Meeting room.** Drop the cairn to capture the coordinate. Contents and Space ownership are `CRN-027`'s job — leave it with a title and nothing else.

**4 — The demo stage.** Personal cairn, one short voice stone addressed to the judges, recorded that morning, which they can only hear because they are standing there. This is the closing beat.

Then, for each of the four: record the coordinate to six decimal places, the accuracy reading the phone reported, and a landmark photo of the exact spot, into the table below. A lat/lng is not findable by a teammate who was not standing next to you.

| # | Where | Lat | Lng | Reported accuracy | Cairn id | Landmark photo |
|---|---|---|---|---|---|---|
| 1 | Entrance | | | | | |
| 2 | Corridor / stairwell | | | | | |
| 3 | Meeting room | | | | | |
| 4 | Demo stage | | | | | |

Approach bearing for cairn 1 (the direction you walk in from, for the 200m blur beat): ________

**Second pass — 13:15, once `CRN-013` and `CRN-014` have landed.** Walk back to the corridor and put the three pins the pitch names onto cairn 2's photo stone, through the pin UI, in this order:

1. **Voice pin** — "the last technician." A different voice from cairn 1. Names the part, names what he did, trails off the way a real handover does. 10–20 seconds.
2. **Text pin** — short, flat, factual: a date and a part number.
3. **Unresolved pin** — place it like the others, then set the flag by hand: `update pins set unresolved = true where id = '<pin 3 id>'`. There is no capture-side UI for it and no other ticket sets it; this is the only place it happens.

Record the three pin ids as you go:

| Pin | Kind | Feature it sits on | Pin id |
|---|---|---|---|
| 1 | Voice — "the last technician" | | |
| 2 | Text — date + part number | | |
| 3 | Unresolved — terracotta | | |

## Acceptance criteria

- [ ] Four cairns exist in the database, each created through the app on a physical device, and all four render as glyphs on the map.
- [ ] The table above is filled in — four coordinates at six decimal places, four accuracy readings, four cairn ids, four landmark photos in the repo or shared album.
- [ ] Every reported accuracy is **≤ 20m**. A row with 65m accuracy is not a seeded cairn, it is a guess.
- [ ] Standing at cairn 1, its voice stone plays on a **second** device signed in as a different account — proving it went to the server, not just the recording phone's cache.
- [ ] Cairn 1's audio is between 10 and 25 seconds long and is audible over ambient noise on phone speaker at arm's length.
- [ ] Cairn 2's photo stone opens at full resolution when standing in the corridor and the physical object in the photo is identifiable from three metres away.
- [ ] No two of the four coordinates are within 60m of each other, checked on a map, so only one cairn unlocks at a time.
- [ ] There is at least one approach path where you stand 200m+ from cairn 1 and it renders as glyph-and-distance only. Bearing recorded above.
- [ ] Nothing seeded is within 30m of where the audience sits during the pitch — otherwise the gate never visibly closes.
- [ ] Cairn 2's photo stone carries exactly three pins — voice, text, unresolved — placed through the app in that order, each on a distinct visible feature, with all three ids recorded in the pin table above.
- [ ] `select unresolved from pins where stone_id = '<cairn 2 photo stone>'` returns true for pin 3 and false for pins 1 and 2.
- [ ] Standing in the corridor, a **second** device signed in as a different account opens the photo stone and renders all three pins — 1 and 2 amber, 3 terracotta, distinguishable from the back of the room — and tapping each raises the right card, with the voice pin playing.

## Not in this ticket

Building the pin-placement UI and the pin viewer — `CRN-013`/`CRN-014`, landing at 13:15. *Placing* cairn 2's three pins and setting the unresolved flag is this ticket's second pass, above: those tickets build the tools, this one seeds the content, and neither of them will do it for you. Cairn 3's eleven stones, its Space and its four fake authors — all `CRN-027`. Fixed-route position override — `CRN-025`, which consumes this table. Rehearsal — `CRN-028`. What you say while walking — `CRN-029`.

## Notes & traps

- **Check Precise Location before you leave the room.** iOS lets a user grant *reduced* accuracy, which fuzzes the coordinate to a kilometre or more. Everything still "works", every cairn is silently in the wrong place, and you will blame the map. `expo-location`'s permission response exposes the precise/reduced state — read it, and confirm Settings → Privacy → Location Services → Cairn → Precise Location is on.
- **Let the fix settle.** The first position after a cold start can be tens of metres out and then walk toward the truth over 20–30 seconds. Stand still, watch the reported `accuracy` value stop improving, *then* drop. Request the highest accuracy tier `expo-location` offers rather than the default balanced one — it costs battery and nothing else today.
- **Indoors, GPS is bad, and cairns 2 and 3 are indoors.** Expect 30–60m error in a corridor and worse in a windowless meeting room. If accuracy will not come under 20m, take the reading standing in the nearest doorway or at the window, write the offset down, and treat that coordinate as the cairn's true position. A cairn 15m outside the wall of the right room beats a cairn 50m into the car park.
- **Six decimals.** Five decimal places is ~1.1m, six is ~0.11m. Truncating to four puts you 11m away, which is a third of the unlock radius.
- **The silent switch will ruin the demo, not the code.** On iOS, audio recorded and played through the default session is inaudible when the ringer switch is set to silent unless the audio mode explicitly permits playback in silent mode. Set that mode in the app (`expo-audio` exposes an audio-mode setter — check the current API rather than guessing the property name), and *also* physically check the switch before every rehearsal. On stage it presents as "the app is broken."
- **Recording levels.** Shield the bottom of the phone from wind at the entrance, hold it 20–30cm from your mouth, and do not record next to an HVAC intake or a glass atrium — reverb makes the fifteen-second emotional beat sound like a hostage tape. Listen back on speaker before you walk away; re-recording takes 40 seconds now and is impossible later.
- **Keep it to 15 seconds.** The cap is 60s and a 55-second note will kill the room's attention exactly where you need it. Write the sentence before you press hold.
- **The demo stage may not be reachable at 12:30.** Drop cairn 4 as close as you can get, write down that it is provisional, and plan to re-drop it live during the first rehearsal at 15:45 if the stage opens up. Dropping a cairn live in front of judges is a fine beat anyway.
- **A small venue defeats the mechanic.** If everything is inside 30m of everything, cairn 4 is permanently unlocked and there is no blur to show indoors. That is fine — the blur beat belongs to cairn 1 on the outdoor approach, or to `CRN-025`'s route override. Decide which now and tell `CRN-029`.
- **Seed as the account you will demo from**, or make sure that account can read all four. Discovering at 15:50 that the demo phone is signed in as a user who cannot see cairn 2 is a five-minute fix and a ten-minute panic.
- Write the coordinates into `DEMO.md` as well as this table the moment you have them. One person holding four lat/lngs in a Notes app is a single point of failure.
- Do not seed from the simulator. A simulated location will happily create rows that no phone will ever be near.
