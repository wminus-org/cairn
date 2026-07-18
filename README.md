<div align="center">

<img src="https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fimages.rawpixel.com%2Fdark_image_png_social_square%2FcHJpdmF0ZS9sci9pbWFnZXMvd2Vic2l0ZS8yMDI1LTA3L3NyLWltYWdlLTIzMDcyNS1tdC1zLTAxNF8xLnBuZw.png&f=1&nofb=1&ipt=268ce390f2782cd2a30c575774c27ce6986c058bdfbedf4e06dbbf711554e272" width="140" alt="Cairn" />

# Cairn

### Leave a note where it happened — heard only by whoever stands there next.

Voice and photo notes pinned to a place. From across the square a cairn is just a shape and a distance. Walk up to it and it opens: someone's voice, right where they left it.

<br />

![Expo SDK 54](https://img.shields.io/badge/Expo_SDK_54-000020?style=for-the-badge&logo=expo&logoColor=white)
![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)
![iOS](https://img.shields.io/badge/iOS-000000?style=for-the-badge&logo=apple&logoColor=white)

<br />

[![▶  Read the Plan](https://img.shields.io/badge/▶__Read_the_Plan-FF5A1F?style=for-the-badge&logoColor=white)](tracker/PLAN.md)
[![Demo Script](https://img.shields.io/badge/Demo_Script-0C2528?style=for-the-badge)](tracker/DEMO.md)
[![Design System](https://img.shields.io/badge/Design_System-0C2528?style=for-the-badge)](tracker/reference/design-system.md)

</div>

---

## The idea

Every company with people in the field has institutional memory that only exists as photos in a group chat — construction handovers, facilities, field service, property inspections. Cairn attaches it to the **location** instead, and it unlocks when you're standing there.

> **"This is a cairn. Someone left a voice here.**
> From over there it was a shape and a number — that's all the app will give you.
> Standing on it, it opens."**

No feed. No timeline. The map is the memory, and distance is the key.

---

## How the distance mechanic works

The gate is enforced **server-side** — the client sends where it is, the server decides what comes back. There is no "locked but downloaded" state to bypass.

| Band | Distance | What you get |
|:--|:--|:--|
| 🗿 **Far** | `> 200 m` | A glyph and a number. Nothing else. |
| 🌫️ **Approach** | `30–200 m` | A blurred waveform that **sharpens as you walk in** — no audio, no image, no text on the wire yet. |
| 🔦 **Here** | `< 30 m` | Full resolution. The newest voice note autoplays. Photos reveal their pins. |

Radius is per-cairn (`radius_m`), read live from the server — never hardcoded.

---

## What's inside

- **🎙️ Stacked-stone waveform** — hold to speak; each syllable drops a stone onto a growing amber stack. The one piece of motion people remember.
- **📍 Photo pins with a torch reveal** — tap a point on a photo and the image lights up around that spot while a technician's voice explains it. Unresolved issues glow terracotta.
- **🧵 The thread** — a cairn is a conversation held at a coordinate over months. Newest stone on top, oldest at the bottom.
- **✨ Brief me** — one press synthesises the whole thread into ~25 seconds of spoken summary. Hands-free, standing at the thing, with a drill in the other hand.
- **🗺️ Living map** — contour dots that grow with a cairn's history; a heat map when you zoom out.
- **👥 Projects (Spaces)** — team cairns, invisible to non-members. Not locked — *invisible*.

---

## Design language

A field journal, not a social app. Five colours, square corners, no shadows, no icon set beyond the cairn stack. Amber (`#FF5A1F`) means exactly one thing — *you are here and this is open to you* — and is spent nowhere else.

Type is Instrument Serif (display) over Space Mono (labels, distances, timestamps). Full spec in [`tracker/reference/design-system.md`](tracker/reference/design-system.md).

---

## Tech

| Layer | Choice |
|:--|:--|
| App | Expo SDK 54 · React Native · expo-router · TypeScript |
| Map | Apple Maps via `react-native-maps` — runs in **Expo Go**, no native tokens |
| Backend | Supabase — Postgres + RLS, anonymous auth, Storage |
| The gate | `SECURITY DEFINER` RPCs (`cairns_nearby`, `cairn_detail`, `stack_stone`) that compute distance server-side |
| Audio | `expo-audio` (record + playback) · `expo-speech` (Brief me TTS) |

---

## Run it

Cairn runs straight in **Expo Go** — no build, no signing.

```bash
git clone https://github.com/wminus-org/cairn.git
cd cairn
npm install

# .env (gitignored)
echo 'EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co'  >  .env
echo 'EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY'         >> .env

npx expo start --go          # scan the QR with Expo Go
```

On a different network from the machine? Add `--tunnel`.

---

<div align="center">

**Cairn** · voice notes, left in place.

The spec is [`tracker/PLAN.md`](tracker/PLAN.md) and it wins every argument.

</div>
