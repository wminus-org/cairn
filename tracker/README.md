# Cairn — Project Tracker

Build day: **Saturday 2026-07-18, 10:30 → 16:30.** Freeze at 15:30.

Everything here derives from [`PLAN.md`](PLAN.md), which is the spec, verbatim. If a ticket and the plan disagree, the plan wins and the ticket is wrong.

## Where to look

| File | What it's for |
|---|---|
| [`PLAN.md`](PLAN.md) | The source spec. Read once at 10:15, don't re-litigate it. |
| [`BOARD.md`](BOARD.md) | Every ticket, its status, owner, and what it blocks. **This is the file you update.** |
| [`SCHEDULE.md`](SCHEDULE.md) | Hour-by-hour running order with the cut decisions pre-made. |
| [`DEMO.md`](DEMO.md) | The four-cairn route, the pitch beats, the rehearsal checklist. |
| [`tickets/`](tickets/) | One file per unit of work. |
| [`reference/`](reference/) | Design system, data model, vocabulary, positioning, risks. Look things up, don't re-derive. |

## Ticket conventions

Filename: `tickets/CRN-0NN-short-slug.md`. IDs are permanent — never renumber.

Every ticket opens with YAML frontmatter, exactly these keys in this order:

```yaml
---
id: CRN-000
title: Human-readable title
epic: E0 Foundation
priority: P0
status: todo
owner: unassigned
estimate: 30m
slot: "10:30"
depends_on: [CRN-000]
blocks: [CRN-000]
---
```

Then the body, in this order:

- `# CRN-000 — Title`
- **One line.** — what this ticket is, in a single sentence.
- `## Why this exists` — the reason it's on the board, tied back to the plan or the demo.
- `## Scope` — what to actually build.
- `## Acceptance criteria` — checkbox list. Each item independently checkable by someone who didn't write the ticket.
- `## Not in this ticket` — the adjacent work that is explicitly someone else's or nobody's.
- `## Notes & traps` — the thing that will eat an hour if nobody says it out loud.

Keep tickets short. A ticket that takes five minutes to read costs more than it saves on a six-hour build.

## Field values

**`priority`**

| | Meaning |
|---|---|
| `P0` | The demo does not happen without this. Build it even if everything else burns. |
| `P1` | The demo is materially weaker without it. Cut only under the rules in `SCHEDULE.md`. |
| `P2` | Nice. First to go. Assume it will not ship. |

**`status`** — `todo` → `in-progress` → `done`, plus `blocked` and `cut`.

Mark `cut` rather than deleting. At 16:30 you want to be able to say what you chose not to build, which is a better answer than pretending you never considered it.

**`slot`** — the clock time from the plan's build order. It's a starting gun, not a deadline.

**`estimate`** — honest wall-clock for one person. If a ticket reads over `60m`, it's two tickets.

## Epics

| | Epic | Owns |
|---|---|---|
| `E0` | Foundation | Expo scaffold, Supabase schema, auth, storage, the server-side proximity gate |
| `E1` | Map | Contour base style, cairn glyphs, live position |
| `E2` | Capture | Dropping a cairn, hold-to-record voice, photo capture, photo pins |
| `E3` | Proximity | The blur-to-sharpen distance mechanic |
| `E4` | Stacking | The stone thread and adding to it |
| `E5` | Spaces | Create, join by code, scoped visibility, theming |
| `E6` | Intelligence | Transcription, "Brief me", TTS |
| `E7` | Surfaces | Nearby list, demo mode |
| `E8` | Demo | Seeding, rehearsal, the pitch itself |

## Stack

Expo / React Native, iOS-first, Supabase backend, **Mapbox** (`@rnmapbox/maps`) for the map. Android is explicitly out of scope — see [`reference/scope-and-risks.md`](reference/scope-and-risks.md).

> **Mapbox forces a custom dev client.** `@rnmapbox/maps` contains native code, so it cannot run in Expo Go. The project must be prebuilt (`npx expo prebuild` → `npx expo run:ios`) and you need a Mapbox **secret** download token (`DOWNLOADS:READ` scope) in `.netrc`/env *in addition to* the public access token. Do this at 10:30 — see [`CRN-001`](tickets/CRN-001-expo-scaffold-dev-client.md). If it is 11:15 and the map has never rendered on a real device, that is the emergency, not a task.

## Working rules

1. **The gate is server-side.** Any ticket that returns audio URLs or transcripts to a client that hasn't proven proximity is a bug, not a shortcut. A judge will open the network inspector.
2. **Pin coordinates are normalized 0–1.** Never pixels. This is the single cheapest hour you can save today.
3. **Seed the demo data before lunch**, while it's light out and nobody is panicking.
4. **15:30 is a freeze, not a suggestion.** After it, the only permitted work is walking the route.
5. If you are behind at 14:00, cut Spaces and finish photo pins. Pins are the product. The business model fits in a sentence; a missing feature does not.
