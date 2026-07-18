# Demo

The route, the words, the checklist. Read it at 15:25. Read it again at 16:25.

Four cairns, walked in order, phone mirrored to the screen. Total budget **5:20**. The only place you say "construction," "facilities," "field service," or "property" is the last forty seconds.

---

## 1. The route

| Leg | Beat | Budget | Running |
|---|---|---|---|
| — | Walk on, first line | 0:20 | 0:20 |
| 1 | Outside the entrance — the voice note | 0:35 | 0:55 |
| → | Walk to the corridor | 0:20 | 1:15 |
| 2 | Corridor — the photo with three pins | 1:10 | 2:25 |
| → | Walk to the meeting room | 0:20 | 2:45 |
| 3 | Meeting room — the Space cairn, **Brief me** | 1:15 | 4:00 |
| → | Walk back to the stage | 0:15 | 4:15 |
| 4 | The stage — the cairn for the judges | 0:25 | 4:40 |
| — | The close | 0:40 | 5:20 |

If you are running long, cairn 2 loses the text pin and nothing else. Never shorten cairn 3.

This table is the single source of truth for demo timing: 5:20 target, 5:40 hard ceiling. CRN-029's script card takes its beats and running totals from here, not the other way round. If the confirmed slot is shorter than 5:50, cut cairn 2's text pin first and re-time.

---

### Cairn 1 — Outside the entrance

**Where.** Ten metres outside the main door, on the approach the judges walked in on. Outdoors on purpose: real GPS, real lock, no demo mode yet.

**What's on it.** One voice stone. Fifteen seconds, one human voice, warm, specific to that doorway — something you would only say to whoever came next. Not a product description. If it sounds like marketing, re-record it.

**Time.** 35 seconds, of which 15 is you silent while it plays.

**What you say.**

> "This is a cairn. Someone left a voice here." *(hold the phone up, screen showing the glyph and the distance number)*
>
> "From over there it was a shape and a number — that's all the app will give you." *(walk the last few metres; the waveform sharpens as you close)*
>
> "Standing on it, it opens."

Let it autoplay. **Say nothing for the full fifteen seconds.** Then, once:

> "Cairn lets you leave your voice somewhere, so it's only heard by whoever stands there next."

Walk.

**Has to work:** CRN-006 (contour style), CRN-007 (glyph), CRN-008 (live position), CRN-005 (server gate), CRN-015 (blur → sharpen on approach), CRN-016 (thread + playback), CRN-026 (seeded).

**Fails gracefully to:** nothing. This is the emotional case. If cairn 1 does not play, you have no opening — start at cairn 2 and move the positioning line there.

---

### Cairn 2 — The corridor

**Where.** A corridor or stairwell with a real radiator, valve, riser panel, or fire door on it. It must be a genuinely ugly, genuinely real piece of building. A meeting-room whiteboard does not work here.

**What's on it.** One photo stone of that exact object, carrying three pins:

1. **Voice pin** — "the last technician." Different voice from cairn 1. Names the part, names what he did, trails off the way a real handover does.
2. **Text pin** — short, flat, factual. A date and a part number.
3. **Unresolved pin** — terracotta `#C0563A`. Something still open. This is the pin you point at.

**Time.** 1:10.

**What you say.** Stand so the object is behind your shoulder and the room can see both it and the mirrored screen.

> "Same primitive. Different problem." *(open the photo — full-bleed, dimmed, three amber pins)*
>
> "Not a photo of the room. A note attached to a *point* on the thing." *(tap pin 1; the photo brightens around it like a torch, card lifts)*

Let three or four seconds of the technician's voice play, then talk over it and put your free hand **on the actual radiator**:

> "That's the last guy who worked on this. This one." *(hand on the object)* *(tap pin 3 — terracotta)*
>
> "And this one is still open. Nobody closed it out. It's been sitting on the valve since March, where the next person to stand here will find it."

Do not explain normalized coordinates. Do not say "we store x and y."

**Has to work:** CRN-013 (normalized pins), CRN-014 (pin view + torch reveal), CRN-005, CRN-026 (photo, pins, and the unresolved flag seeded), CRN-025 (demo mode — you are indoors now).

**Fails gracefully to:** if the torch reveal misbehaves, the pins and the cards still work. Tap and talk; don't chase the animation.

---

### Cairn 3 — The meeting room

**Where.** A meeting room the judges can physically stand in, or in the doorway of. This is the Space cairn, so it is invisible to anyone not in the Space — worth one sentence, not two.

**What's on it.** Eleven stones, four accounts, three months. The thread has to *look* like three months: dates spread, voices that disagree, one thing raised twice and never resolved. Space accent on the glyph.

**Time.** 1:15, and 25 seconds of it is the machine talking while you say nothing.

**What you say.**

> "This one belongs to a team. If you're not in the Space, you're standing on it right now and the map is empty — not locked, empty."
>
> *(scroll the thread, thumb moving, don't read it aloud)* "Eleven stones. Four people. March to now."
>
> "Nobody is going to listen to eleven voice notes with a drill in their hand."

Press **Brief me**. Hold the phone up, screen out, and **stop talking**.

Let the whole briefing play. Do not fill the gap. Do not nod along. The silence in the room while a machine summarises three months of a place's history is the moment that wins this — the only way to lose it is to talk over it.

When it ends, one line, then walk:

> "That's the site history. Spoken, hands free, standing at the thing."

**Has to work:** CRN-023 (**Brief me**, cached — see below), CRN-016 (thread), CRN-027 (eleven stones seeded), CRN-005. CRN-020 (Space visibility) and CRN-021 (theming) are both cuttable: if Spaces are cut at 14:00 the demo account is a hardcoded member, the cairn still renders, and the invisibility line becomes a claim you say rather than a thing you show — say it, do not try to demonstrate it.

**Fails gracefully to:** the briefing summary text is on screen even if TTS stalls. See "when it breaks."

---

### Cairn 4 — The stage

**Where.** The spot you are standing on to pitch. Drop it in the morning, from that exact position, and confirm it is there during rehearsal.

**What's on it.** One voice stone addressed to the judges by name or by role, recorded that morning, referencing something only true of today. Fifteen seconds, maximum.

**Time.** 25 seconds. Then the close.

**What you say.**

> "One more. I dropped this here this morning." *(phone up, screen out)*
>
> "You can only hear it because you're standing here."

Play it. Silence. Then go straight into the close — no pause, no "so, to summarise."

**Has to work:** CRN-009 + CRN-010 + CRN-011 (you dropped it live this morning, so the whole capture path), CRN-005, CRN-015, CRN-026 (verified present in rehearsal).

**Fails gracefully to:** nothing, and it doesn't need to. If cairn 4 is dead, skip it silently and deliver the close from where you are standing. Nobody knows it was supposed to exist.

---

## 2. Coordinates — TODO (CRN-026)

**Fill these in when the route is actually seeded, before lunch.** They are the difference between a rehearsal and a walk.

| # | Cairn | lat | lng | Space | Seeded | Verified in rehearsal |
|---|---|---|---|---|---|---|
| 1 | Outside the entrance | `TODO` | `TODO` | personal | ☐ | ☐ |
| 2 | Corridor / stairwell | `TODO` | `TODO` | personal | ☐ | ☐ |
| 3 | Meeting room | `TODO` | `TODO` | demo Space | ☐ | ☐ |
| 4 | Demo stage | `TODO` | `TODO` | personal | ☐ | ☐ |

Take the coordinates **standing on the spot with the phone**, not from a satellite view. Paste the same four pairs into the CRN-025 demo-mode route so the override and the real cairns agree — a demo route that walks past its own cairns by 40m is the failure mode here.

Also TODO, in the close: **one** market number, sourced, that you can defend in a follow-up question. Pick it before 15:30. Say it once.

---

## 3. Delivery rules

- **Mirror the phone to the screen.** Confirm mirroring before you walk on, not on stage. The room is watching the screen, so the phone must never leave frame.
- **Walk while pitching.** The walking *is* the argument — it is the only way the room sees that distance is the mechanic. Standing still and tapping is a different, worse demo.
- **Do not narrate architecture.** No Supabase, no RPC, no "server-side gate," no Mapbox, no React Native. If a judge asks how the gate works, answer it in the Q&A in one sentence and stop.
- **Silence is a feature.** Two places you shut up entirely: cairn 1 while the voice plays, cairn 3 while the briefing plays. Both feel much longer to you than to the room. Do not rescue them.
- **Point at physical things.** Hand on the radiator at cairn 2. Phone screen out at cairns 3 and 4.
- **The last forty seconds is the only business slide,** and there is no slide. That is where "construction, facilities, field service, property" and the market number live, in one breath:

> "Every company with people in the field has institutional memory that only exists as photos in a group chat — construction handovers, facilities, field service, property inspections. We attach it to the location instead, and it unlocks when you're there. That's `[MARKET NUMBER — TODO]`."

Then stop. Don't add a thank-you paragraph.

---

## 4. Rehearsal checklist (CRN-028)

Three full runs, 15:30 → 16:30, door to close, no restarts. Tick a column per run. A run with a skipped step is not a run.

**Pre-flight — every run, from cold**

| Check | R1 | R2 | R3 |
|---|---|---|---|
| Phone ≥ 80% charge, cable in pocket | ☐ | ☐ | ☐ |
| Do Not Disturb on, notifications silenced | ☐ | ☐ | ☐ |
| Auto-lock set to Never | ☐ | ☐ | ☐ |
| Media volume at max, ringer switch not muting playback | ☐ | ☐ | ☐ |
| Not on venue wifi if venue wifi is flaky — hotspot tested | ☐ | ☐ | ☐ |
| App force-quit and launched cold | ☐ | ☐ | ☐ |
| Logged in as the demo account, not your dev account | ☐ | ☐ | ☐ |
| Mirroring connected and showing the phone | ☐ | ☐ | ☐ |
| Demo mode toggle in the state you want **before** walking on | ☐ | ☐ | ☐ |

**The walk**

| Check | R1 | R2 | R3 |
|---|---|---|---|
| All four cairns visible on the map / Nearby at start | ☐ | ☐ | ☐ |
| C1 renders sealed on approach, sharpens, opens, autoplays | ☐ | ☐ | ☐ |
| C1 audio audible over room noise from three metres | ☐ | ☐ | ☐ |
| C2 photo opens; all three pins present | ☐ | ☐ | ☐ |
| C2 voice pin plays; terracotta pin reads as unresolved | ☐ | ☐ | ☐ |
| C2 pins land on the right parts of the object (no offset) | ☐ | ☐ | ☐ |
| C3 Space cairn visible to the demo account | ☐ | ☐ | ☐ |
| C3 thread shows 11 stones, 4 authors, dates spanning 3 months | ☐ | ☐ | ☐ |
| **Brief me returns in < 3s and plays to the end** | ☐ | ☐ | ☐ |
| C4 present, opens on stage, plays | ☐ | ☐ | ☐ |

**Timing and close**

| Check | R1 | R2 | R3 |
|---|---|---|---|
| Total run time (write it here) | ____ | ____ | ____ |
| Under 5:40 door to close | ☐ | ☐ | ☐ |
| Business words said **only** in the last 40s | ☐ | ☐ | ☐ |
| Market number said once, correctly | ☐ | ☐ | ☐ |
| No architecture narrated at any point | ☐ | ☐ | ☐ |

**After each run:** note the one thing that wobbled. Fix it only if the fix is a data change or a toggle. **It is past 15:30 — you do not ship code to fix a rehearsal note.**

---

## 5. When it breaks on stage

The rule, and it is the only rule here: **you never announce a failure the room has not already noticed.** No "hmm," no "it usually," no "one second." Every fallback below is something you do while still talking.

**The map doesn't load.**
Switch to **Nearby** (CRN-024) and keep walking. Do not comment on it, do not go back and try the map again. Nearby is sorted by distance and grouped by Space — it makes exactly the same argument, and the room has no idea it was second choice.

**GPS is wrong indoors.**
Demo mode (CRN-025), toggled **before you walk on**, not during. Decide at 15:00, based on a real walk of the route at 15:00 with CRN-025 already built and tested — if the real distance at any cairn will not come inside its `radius_m`, you run the whole demo in demo mode, including cairn 1 outdoors. If a rehearsal run later contradicts the 15:00 call, the rehearsal wins. Consistency beats authenticity here. Toggling on stage is how you end up in the settings screen on a mirrored display.

**Brief me is slow.**
It is cached — the briefing for cairn 3 is generated and stored before the demo, so the button is a fetch, not a generation. If it stalls anyway, **keep talking** and let it arrive:

> "Eleven notes, four people, three months, and nobody has time to listen to all of it —"

and it lands under you. The summary text is on screen regardless; if the audio never comes, read the first two lines aloud yourself and move on. Do not press the button twice.

**Audio doesn't play.**
The transcript is on screen. Read it. Do it in the voice of the person who left it, not in the voice of someone reading an error message. This works at every cairn, which is why transcripts are on screen at all.

**You are standing at a cairn and it is empty.**
Walk to the next one mid-sentence. The route is four cairns; the pitch survives three. Losing 15 seconds is invisible. Standing still and tapping a dead card is not.
