# Board

**This is the file you update.** Change `status` here and in the ticket's frontmatter when you pick something up.

Status: `todo` · `in-progress` · `done` · `blocked` · `cut` — mark `cut`, never delete. At 16:30 you want to be able to say what you chose not to build.

Build day: 2026-07-18, 10:30 → 16:30. Freeze 15:30.

---

## E0 — Foundation

Nothing else starts until this epic is green. CRN-001 and CRN-002 are parallelisable across two people and should be.

| ID | Title | P | Slot | Est | Status | Owner | Depends on |
|---|---|---|---|---|---|---|---|
| [CRN-001](tickets/CRN-001-expo-scaffold-dev-client.md) | Expo scaffold and Mapbox custom dev client | P0 | 10:30 | 40m | todo | — | — |
| [CRN-002](tickets/CRN-002-supabase-schema.md) | Supabase schema: all seven tables in one paste | P0 | 10:30 | 30m | todo | — | — |
| [CRN-003](tickets/CRN-003-storage-buckets.md) | Storage buckets and upload paths | P0 | 10:30 | 20m | todo | — | CRN-002 |
| [CRN-004](tickets/CRN-004-auth-and-profiles.md) | Auth and profiles | P0 | 10:30 | 25m | todo | — | CRN-002 |
| [CRN-005](tickets/CRN-005-proximity-gate-rpc.md) | Server-side proximity gate | P0 | 11:00 | 45m | todo | — | CRN-002, CRN-004 |

## E1 — Map

| ID | Title | P | Slot | Est | Status | Owner | Depends on |
|---|---|---|---|---|---|---|---|
| [CRN-006](tickets/CRN-006-mapbox-contour-style.md) | Mapbox contour-only base style | P0 | 11:00 | 40m | todo | — | CRN-001 |
| [CRN-007](tickets/CRN-007-cairn-glyph.md) | Cairn glyph with stone-count height | P0 | 11:00 | 40m | todo | — | CRN-005, CRN-006 |
| [CRN-008](tickets/CRN-008-live-position.md) | Live position and follow mode | P0 | 11:00 | 25m | todo | — | CRN-006 |

## E2 — Capture

The 11:45 milestone is CRN-011. The 13:15 block is the highest-value hour of the day.

| ID | Title | P | Slot | Est | Status | Owner | Depends on |
|---|---|---|---|---|---|---|---|
| [CRN-009](tickets/CRN-009-drop-a-cairn.md) | Drop a cairn | P0 | 11:45 | 35m | todo | — | CRN-002, CRN-008 |
| [CRN-010](tickets/CRN-010-hold-to-record.md) | Hold-to-record with stacked-stone waveform | P0 | 11:45 | 45m | todo | — | CRN-001 |
| [CRN-011](tickets/CRN-011-voice-stone-upload.md) | Voice stone: upload and appear on the map | P0 | 11:45 | 30m | todo | — | CRN-003, CRN-009, CRN-010 |
| [CRN-012](tickets/CRN-012-photo-capture.md) | Photo capture and upload | P0 | 13:15 | 25m | todo | — | CRN-003, CRN-009 |
| [CRN-013](tickets/CRN-013-pin-placement.md) | Pin placement with normalized coordinates | P0 | 13:15 | 40m | todo | — | CRN-012 |
| [CRN-014](tickets/CRN-014-photo-pin-view.md) | Photo pin view with torch reveal | P0 | 13:15 | 45m | todo | — | CRN-013 |

## E3 — Proximity

| ID | Title | P | Slot | Est | Status | Owner | Depends on |
|---|---|---|---|---|---|---|---|
| [CRN-015](tickets/CRN-015-distance-blur-sharpen.md) | Distance-gated blur and sharpen | P0 | 14:30 | 45m | todo | — | CRN-005, CRN-007, CRN-008 |

## E4 — Stacking

| ID | Title | P | Slot | Est | Status | Owner | Depends on |
|---|---|---|---|---|---|---|---|
| [CRN-016](tickets/CRN-016-stone-thread.md) | Stone thread | P0 | 14:30 | 35m | todo | — | CRN-005, CRN-011 |
| [CRN-017](tickets/CRN-017-stack-a-stone.md) | Stack a stone onto an existing cairn | P0 | 14:30 | 25m | todo | — | CRN-010, CRN-016 |

## E5 — Spaces

**Cut candidate.** If photo pins aren't working at 14:00, this whole epic becomes a hardcoded demo team.

Cutting it is survivable because nothing on the demo path depends on it. CRN-027 seeds its Space row directly in SQL at 12:30 — it does not wait for the in-app create flow — so **Brief me still works with Spaces cut entirely.**

| ID | Title | P | Slot | Est | Status | Owner | Depends on |
|---|---|---|---|---|---|---|---|
| [CRN-018](tickets/CRN-018-create-space.md) | Create a Space with a join code | P1 | 14:00 | 30m | todo | — | CRN-002, CRN-004 |
| [CRN-019](tickets/CRN-019-join-by-code.md) | Join a Space by six-character code | P1 | 14:00 | 20m | todo | — | CRN-018 |
| [CRN-020](tickets/CRN-020-space-scoped-visibility.md) | Space-scoped visibility | P1 | 14:00 | 30m | todo | — | CRN-005, CRN-019 |
| [CRN-021](tickets/CRN-021-space-theming.md) | Space theming: accent and wordmark | P2 | 14:00 | 25m | todo | — | CRN-007, CRN-020 |

## E6 — Intelligence

CRN-023 deliberately does **not** depend on CRN-022 — it reads stored transcripts, which CRN-027 seeds. Live transcription failing costs polish, not the winning moment.

| ID | Title | P | Slot | Est | Status | Owner | Depends on |
|---|---|---|---|---|---|---|---|
| [CRN-022](tickets/CRN-022-transcription.md) | Transcription on upload | P1 | 15:00 | 35m | todo | — | CRN-011 |
| [CRN-023](tickets/CRN-023-brief-me.md) | Brief me: spoken synthesis of a cairn | P0 | 15:00 | 45m | todo | — | CRN-016, CRN-027 |

## E7 — Surfaces

Both of these are insurance. CRN-024 is the fallback if the map misbehaves; CRN-025 is the fallback if the venue's GPS does.

| ID | Title | P | Slot | Est | Status | Owner | Depends on |
|---|---|---|---|---|---|---|---|
| [CRN-024](tickets/CRN-024-nearby-list.md) | Nearby list | P1 | 14:30 | 30m | todo | — | CRN-005 |
| [CRN-025](tickets/CRN-025-demo-mode-route-override.md) | Demo mode: fixed-route position override | P0 | 15:00 | 30m | todo | — | CRN-008 |

## E8 — Demo

CRN-026 and CRN-027 happen **before lunch**, while it's light and nobody is panicking. Seeding real audio at real coordinates cannot be done later from a desk.

| ID | Title | P | Slot | Est | Status | Owner | Depends on |
|---|---|---|---|---|---|---|---|
| [CRN-026](tickets/CRN-026-seed-demo-route.md) | Seed the four-cairn demo route | P0 | 12:30 | 45m | todo | — | CRN-011 |
| [CRN-027](tickets/CRN-027-seed-space-cairn.md) | Seed the eleven-stone Space cairn | P0 | 12:30 | 35m | todo | — | CRN-026 |
| [CRN-028](tickets/CRN-028-rehearsal.md) | Freeze and three full rehearsals | P0 | 15:30 | 60m | todo | — | CRN-025, CRN-026, CRN-027 |
| [CRN-029](tickets/CRN-029-pitch-script.md) | Pitch script and phone mirroring | P0 | 15:30 | 30m | todo | — | CRN-026 |

---

## Critical path

The longest chain to the thing that wins the room:

```
CRN-002 → CRN-004 → CRN-005 → CRN-016 → CRN-023
schema     auth      gate       thread    Brief me
```

running alongside the chain that has to exist for anything to be visible at all:

```
CRN-001 → CRN-006 → CRN-008 → CRN-009 → CRN-011 → CRN-026
scaffold   style     position   drop      upload    seeded route
```

**CRN-001 is the riskiest node on the board.** It has no dependencies, so it can start at 10:30 sharp, and everything visual is blocked behind it. Mapbox's native SDK needs a custom dev client and a secret download token — see [`reference/scope-and-risks.md`](reference/scope-and-risks.md). If a map has not rendered on a physical device by 11:00, stop and fix that before touching anything else.

## Counts

| | P0 | P1 | P2 | Total |
|---|---|---|---|---|
| Tickets | 23 | 5 | 1 | **29** |
| Estimate | 13h 55m | 2h 25m | 25m | **16h 45m** |

That total is for one person, and the day is six hours long. Even the P0 set alone is nearly fourteen hours of work — so this board is only deliverable by a team of three working in parallel down the two chains above, and even then it is tight. That arithmetic is the whole reason the cut rules in [`SCHEDULE.md`](SCHEDULE.md) are written down now rather than argued about at 14:00 with a judge walking over.
