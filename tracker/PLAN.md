# CAIRN — Build Plan v2

> Source document, verbatim. This is the spec every ticket derives from.
> If a ticket disagrees with this file, this file wins — or the ticket gets fixed.

**Notes left at places, for whoever stands there next.**

---

## The shift

v1 was an art project: leave a voice note at a bench. Charming, hard to pitch to a room containing Silicon Gardens and Bek.

v2 keeps the poetry and adds the wedge. The same primitive — *information pinned to a physical location, unlocked by being there* — is a real operational problem for anyone whose work happens on sites: construction handovers, facilities maintenance, hotel and property inspections, retail merchandising audits, film location scouting, agricultural plots, event build-outs.

Right now that knowledge lives in WhatsApp photos with no context, or in a PDF nobody opens, or in the head of the guy who left. Cairn puts it on the thing itself.

Pitch structure: open with the consumer moment (it's beautiful, it lands emotionally in fifteen seconds), then turn and show the team mode. Consumer demo, B2B business.

---

## Vocabulary

The metaphor now does structural work, which is the reason to keep the name:

| Term | Meaning |
|---|---|
| **Cairn** | A marker at a specific coordinate. A place that has something to say. |
| **Stone** | One contribution to a cairn — a voice note, a photo with pins, or text. Cairns are stacks of stones. |
| **Stacking** | Adding your stone to someone else's cairn. The core collaborative act. |
| **Pin** | A note attached to a specific *point on a photo*, not just the photo. |
| **Space** | A team or company. Cairns inside a Space are visible only to its members. |
| **Trail** | An ordered sequence of cairns. (Stretch.) |

Every one of these words is already in the metaphor. Nothing had to be invented, which is how you know the name was right.

---

## Look

Field journal, not social app. The restraint is the design.

**Map**
Stripped topographic base — contour lines only, no roads, no labels, no POI clutter. Bone white `#E8E3D8` lines on deep green `#0F1E17`. Cairns render as small stacked-stone glyphs whose height encodes how many stones they hold: one contribution is a single pebble, twelve contributions is a tall stack you can read from across the map. Density becomes legible terrain.

**Distance as the primary UI mechanic**
This is the thing that makes Cairn feel like an object rather than a feed. Content is gated by proximity and the gating is *rendered*, not just enforced:

- Beyond 200m: the cairn is a glyph and a distance number. Nothing else.
- 200m → 30m: the waveform preview draws itself but blurred, and photo thumbnails render at heavy pixelation. It sharpens continuously as you close. Walking is the loading bar.
- Inside 30m: full resolution, autoplay, everything unlocked.

**Palette**

| Role | Hex |
|---|---|
| Base | `#0F1E17` |
| Contour / primary type | `#E8E3D8` |
| Accent (unlocked, live) | `#D9A441` amber |
| Space accent | per-Space, set by the org |
| Alert / unresolved | `#C0563A` terracotta |

**Type**
General Sans or Söhne, 1.6 line height, generous margins. Timestamps and distances in a mono at 11pt with letterspacing. Never more than two type sizes on a screen.

**Recording**
Hold to speak. The waveform draws upward as a stack of stones rather than a bar chart — each syllable adds a stone. It's a small thing and it's the detail people will remember.

**Photo pin view**
Full-bleed photo, dimmed to 60%. Pins are small amber circles with a number. Tapping one lifts a card from the bottom with the note; the photo brightens around that pin only, like a torch. Adding a pin: tap anywhere, hold to record.

**Space theming**
A company sets an accent color and a wordmark. Their cairns render in that accent on the map. Costs nothing to build and makes the B2B demo look like a product rather than a hackathon skin.

---

## Feature set — MVP (must be done by 14:30)

**1. Drop a cairn**
Long-press the map or hit the button at your current position. Record voice (60s cap), or take a photo, or both. It's live immediately.

**2. Photo pins**
After a photo is taken, tap points on the image to attach notes. Each pin stores normalized x/y coordinates plus a voice or text note. This is the feature that converts the idea from charming to useful — "the leak is *there*, on that valve, not somewhere in this photo."

**3. Proximity unlock**
30m geofence, continuous blur/sharpen between 200m and 30m as described above.

**4. Stacking**
Anyone with access to a cairn can add a stone. Stones render as a vertical thread, oldest at the bottom, with author and timestamp. A cairn is a conversation held at a coordinate over time.

**5. Spaces**
Create a Space, invite by six-character join code. Every cairn belongs to either your personal collection or a Space. Space cairns are invisible to non-members even when standing on them — the map shows nothing at all, not a locked marker. Membership roles: owner, member. Two roles, no more.

**6. Transcription + spoken briefing**
Every voice stone is transcribed on upload. Then the feature that sells the B2B case: **"Brief me."** Walk up to a cairn with eleven stones from four people over three months, press one button, and get a 25-second spoken synthesis of the whole history — what happened here, what's unresolved, what the last person said. Text-to-speech, hands free, because the user is holding a drill.

**7. Nearby**
A list of cairns sorted by distance, contents hidden, grouped by Space. Works as the fallback demo surface if the map misbehaves.

---

## Explicitly out of scope

Cut without discussion if you're behind: trails, offline sync, voice anonymization, push notifications on geofence entry, Android, photo pin editing after creation, comment reactions, search.

Notification-on-arrival is the most tempting one and the biggest time sink — background location on iOS will eat two hours and it does not appear in a stage demo.

---

## Data model

Seven tables. If you're on Supabase this is one SQL paste.

```
spaces          id, name, accent_hex, join_code, created_by
space_members   space_id, user_id, role
cairns          id, space_id (nullable), lat, lng, title,
                created_by, created_at, radius_m default 30
stones          id, cairn_id, author_id, kind (voice|photo|text),
                body_text, audio_url, image_url, transcript, created_at
pins            id, stone_id, x (0-1), y (0-1), note_text,
                audio_url, transcript
briefings       cairn_id, generated_at, summary_text, audio_url
profiles        id, display_name, avatar_url
```

Two notes that will save you an hour each:

- Store pin coordinates **normalized 0–1**, never pixels. Devices and orientations differ and you will not have time to debug why every pin is in the wrong place on an iPad.
- Do proximity filtering **server-side**. Return cairn positions and stone counts to any client, but never return audio URLs or transcripts for a cairn the requester isn't standing at. If the gate is client-side, the first person to open the network inspector defeats the entire product, and a judge may well ask.

---

## Build order

| Time | Task |
|---|---|
| 10:30 | Supabase schema + auth. All seven tables at once. |
| 11:00 | Map view with contour styling, cairn glyphs, live position. |
| 11:45 | Drop cairn with voice. Record → upload → appear on map. |
| 12:30 | Lunch — but seed the demo cairns around Technology Park *now*, while it's light and you have time. |
| 13:15 | Photo capture + pin placement. The single highest-value hour of the day. |
| 14:00 | Spaces: create, join by code, scoped visibility. |
| 14:30 | Stacking thread + proximity blur/sharpen. |
| 15:00 | Transcription + "Brief me." |
| 15:30 | **Freeze.** No new features. |
| 15:30–16:30 | Walk the demo route three times end to end. Every single time. |

If you hit 14:00 and photo pins aren't working, cut Spaces to a hardcoded demo team and finish the pins. Pins are the product; Spaces are the business model, and a business model can be described in a sentence while a feature cannot.

---

## Demo choreography

**Before 12:30**, seed a route of four cairns:

1. **Outside the entrance** — a personal voice note, warm, human. Someone saying something they'd only say to whoever came next. This is the whole emotional case and it takes fifteen seconds.
2. **A corridor or stairwell** — a photo of an actual radiator, panel, or door, with three pins on it: one voice note from "the last technician," one text note, one unresolved flag in terracotta. Show the same physical object on camera while the pins are on screen.
3. **A meeting room** — a Space cairn with eleven stacked stones from four fake accounts spanning three months. This is where you press **Brief me** and let the phone talk to the room. Silence in the room while a machine summarizes three months of a place's history is the moment that wins this.
4. **The demo stage itself** — a cairn addressed to the judges, dropped that morning, which they can only hear because they are standing there. Close on it.

Mirror the phone to the screen and **walk while pitching**. Do not narrate architecture. The last forty seconds is the only part where you say the words "construction, facilities, field service, property" and give a number for the market.

If the venue's GPS is bad indoors — and it might be — have a demo mode that overrides position along a fixed route, tested and toggleable. Decide this at 15:00, not at 16:25.

---

## Positioning

**Consumer line:**
> Cairn lets you leave your voice somewhere, so it's only heard by whoever stands there next.

**Team line:**
> Cairn pins your team's knowledge to the physical thing it's about. Stand in front of the valve, hear everything anyone has ever said about that valve.

**The line for the VCs:**
> Every company with people in the field has institutional memory that only exists as photos in a group chat. We attach it to the location instead, and it unlocks when you're there.
