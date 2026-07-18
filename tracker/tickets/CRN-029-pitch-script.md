---
id: CRN-029
title: Pitch script and phone mirroring
epic: E8 Demo
priority: P0
status: todo
owner: unassigned
estimate: 30m
slot: "15:30"
depends_on: [CRN-026]
blocks: []
---

# CRN-029 — Pitch script and phone mirroring

**One line.** — The words, in order, timed to the beat, plus the physical setup that puts the phone's screen on the venue's screen without dying.

## Why this exists

The plan is explicit about the shape: open with the consumer moment because it lands emotionally in fifteen seconds, then turn and show team mode. Consumer demo, B2B business. That only works if the order is fixed in advance and the B2B words are held back — a pitch that says "field service" in minute one is a SaaS demo with a nice map, and the emotional open is spent.

Mirroring is in this ticket because it is a real task with a real failure mode, not an assumption. The phone is the entire product surface. If it is not on the screen, there is no demo, and the thing that stops it is usually a cable, a network with client isolation, or audio routed somewhere the room cannot hear.

## Scope

**The script.** One card, timed. The beats and running totals below are copied from [`DEMO.md`](../DEMO.md), which is the single source of truth for demo timing — **5:20 target, 5:40 hard ceiling.** If those two files ever disagree, `DEMO.md` is right and this card is stale.

Confirm the actual slot length before anything else. The card needs a slot of **5:50 or longer**. If the confirmed slot is shorter, cut cairn 2's text pin first and re-time — scale the walk, never the last forty seconds.

| Time | Where | What happens |
|---|---|---|
| 0:00–0:20 | Walking on | Opening line, phone already mirrored and showing the map. |
| 0:20–0:55 | Cairn 1, outside the entrance | Press play. Say nothing for the fifteen seconds it runs. Then the **consumer line, verbatim.** |
| 0:55–1:15 | Walk to the corridor | Distance number falling, preview sharpening. One sentence: walking is the loading bar. |
| 1:15–2:25 | Cairn 2, corridor/stairwell | Photo with three pins. Hold the phone up beside the actual radiator/panel so the room sees both. Point at the terracotta unresolved pin. **Team line, verbatim.** |
| 2:25–2:45 | Walk to the meeting room | Set it up in one sentence: eleven stones, four people, three months. |
| 2:45–4:00 | Cairn 3, meeting room | Press **Brief me**. Then stop talking for the whole 25 seconds. |
| 4:00–4:15 | Walk back to the stage | Say nothing. Let the room absorb it. |
| 4:15–4:40 | Cairn 4, the stage | The cairn addressed to the judges, dropped this morning. It plays because they are standing here and for no other reason. |
| 4:40–5:20 | Standing still, phone down | **VC line, verbatim.** The only place the words construction, facilities, field service, property appear. One market number, one source. Stop. |

**The three lines, verbatim from the plan.** Read them off the card; do not paraphrase.

- Said at **0:40**, at cairn 1, once the voice note has finished playing:
  > Cairn lets you leave your voice somewhere, so it's only heard by whoever stands there next.
- Said at **2:00**, at cairn 2, with the pinned photo on screen:
  > Cairn pins your team's knowledge to the physical thing it's about. Stand in front of the valve, hear everything anyone has ever said about that valve.
- Said at **4:40**, standing still, phone down:
  > Every company with people in the field has institutional memory that only exists as photos in a group chat. We attach it to the location instead, and it unlocks when you're there.

**The market number.** Pick one defensible figure with a nameable source, write it into the card before 16:00, and say the source in the same breath. It has to survive "where's that from?".

**Mirroring.** Pick one path, test it on the venue's actual screen and actual cable before the freeze, and have the next one ready:

1. **Cable** — genuine Apple USB-C/Lightning Digital AV adapter to HDMI. Most reliable picture, but it tethers you and you are supposed to be walking.
2. **AirPlay** to the venue's Apple TV — the only path that lets you walk. Depends entirely on the venue network behaving.
3. **QuickTime Player on a Mac over USB** — New Movie Recording, iPhone as the camera source, then mirror the Mac to the projector. Very reliable, fully tethered, requires "Trust This Computer" already accepted.
4. **Fallback** — the screen recording of a clean run captured in CRN-028, played from the laptop while you narrate live.

Resolve the walking-versus-tethered conflict explicitly: either AirPlay works on the venue network, or the route is walked with the audience following and only the final beat is mirrored from the stage. Decide this before 15:30 and rehearse whichever one you picked.

**Audio routing.** Decide where the sound comes out and prove the back row hears it. With HDMI or AirPlay, audio follows the video to the display, which is silent if nobody hooked the screen to the room's PA.

## Acceptance criteria

- [ ] The script exists as a single card, readable at arm's length, with a time marker on every beat, and its beats match [`DEMO.md`](../DEMO.md) exactly — 5:20 total, 5:40 ceiling.
- [ ] The confirmed slot is 5:50 or longer. If it is not, cairn 2's text pin has been cut and the card re-timed, and the new total is still at least 30 seconds under the slot.
- [ ] The three positioning lines appear character-for-character as in `PLAN.md` — diff them, do not eyeball them — each with an explicit stage direction naming where it is said.
- [ ] Searching the script for `construction`, `facilities`, `field service`, `property` and the market number returns zero hits before the 4:20 marker.
- [ ] Searching the spoken lines for `Supabase`, `Mapbox`, `Edge Function`, `RLS`, `React Native`, `API` returns zero hits.
- [ ] Read aloud at presenting pace with a timer, twice, landing within ±15 seconds of target both times.
- [ ] The "Brief me" beat contains an explicit written instruction to stop talking, and the presenter holds the silence for the full playback in at least one CRN-028 run.
- [ ] The phone's screen is visible on the venue's actual display for 60 continuous seconds with no dropout, using the chosen path and the cable that is physically in the room.
- [ ] Someone standing at the back of the room confirms they can hear the "Brief me" audio, on whichever route the audio takes.
- [ ] The chosen mirroring path is used for at least one complete rehearsal run, not just a 10-second test.
- [ ] A screen recording of one clean run is on the laptop and openable in one click, so the fallback needs no setup.
- [ ] The script names the demo Space and, if it is said out loud, the join code — matching what CRN-027 actually seeded.

## Not in this ticket

- Running the rehearsals or the freeze checklist — CRN-028.
- Seeding the four cairns and their contents — CRN-026.
- Building or wiring the demo-mode override — CRN-025. The script may never say the words "demo mode".
- Slides. There are no slides.

## Notes & traps

- **Do not narrate architecture.** Nobody in the room is buying a schema. The only permitted technical sentence is the one about proximity being enforced server-side, and only if a judge asks.
- **The 25 seconds of silence during "Brief me" is the moment that wins this.** Every instinct will tell you to fill it. Write "SAY NOTHING" in caps on the card and rehearse holding it.
- **Don't read your notes off the demo phone.** It is mirrored. Paper, or a second device.
- **Venue wifi with client isolation kills AirPlay discovery** — the Apple TV simply never appears in the list, and there is no error to debug. If it does not show up in 30 seconds, stop and move to the cable path. Do not troubleshoot a network at 16:20.
- **Cheap third-party HDMI adapters fail on Apple devices** more often than they work — no signal, or a black screen after ten seconds. Use the genuine adapter, and test the specific cable that lives in that room, not the one on your desk.
- **Check the port before you promise a picture.** VGA-only projectors still exist. That is a physical fact you cannot solve on stage.
- **A portrait phone on a 16:9 screen is mostly black bars.** That is fine. Do not fix it by rotating the phone — the map, the cairn card and the recording UI are built portrait.
- **AirPlay adds noticeable latency**, so do not press play and then speak over what the room hears half a second late. Press, pause, let it land.
- **Notification banners and the volume HUD mirror too.** Covered by the device state in CRN-028; if you skipped that, this is where it bites you.
- **Walk while pitching, but slower than feels natural.** The unlock is distance-driven — if you outrun the beat, you are talking about a cairn that has not resolved yet and the screen contradicts you.
- **Cairn 2 only works if you physically point at the object.** The whole argument is that the note is attached to *that valve*. Rehearse the arm movement: phone up beside the real thing, both in the audience's field of view.
- **Never say "we didn't have time to"** or narrate what is missing. Nobody knows what you cut unless you tell them.
- **If something breaks mid-run, keep talking and move to the next cairn.** The recovery is in the script — one prepared sentence per cairn that lets you skip it — not in your hands on the phone.
