---
id: CRN-007
title: Cairn glyph with stone-count height
epic: E1 Map
priority: P0
status: todo
owner: unassigned
estimate: 40m
slot: "11:00"
depends_on: [CRN-005, CRN-006]
blocks: [CRN-015, CRN-021]
---

# CRN-007 — Cairn glyph with stone-count height

**One line.** — Every cairn renders as a stacked-stone glyph whose height encodes `stone_count`, drawn as a symbol layer over the contour base, tappable to open the cairn.

## Why this exists

"Density becomes legible terrain" is the plan's line and it is the map's entire argument. A pin drop tells you a thing exists; a twelve-stone stack tells you *this place has been talked about a lot* from across the map, before you tap anything. It is also the visual that carries the pitch's turn — the meeting-room cairn with eleven stones has to look different from the doorway cairn with one, on screen, while walking.

## Scope

- Consume the cairn feed from CRN-005 (positions + `stone_count`, no gated content) and build one GeoJSON `FeatureCollection` for the whole visible set.
- Render via **`ShapeSource` + `SymbolLayer`**, one source, one layer, all cairns.
- Five pre-rendered glyph assets registered with the map's image registry, bucketed by stone count:

  | Bucket | Stones | Glyph |
  |---|---|---|
  | `s1` | 1 | single pebble |
  | `s2` | 2–3 | short stack |
  | `s3` | 4–6 | medium stack |
  | `s4` | 7–11 | tall stack |
  | `s5` | 12+ | tallest stack |

- Bucket computed when building the FeatureCollection and written onto each feature as a string property; `iconImage` is a `['get', 'bucket']` expression against that property.
- `onPress` on the `ShapeSource` reads the cairn id off the hit feature's properties and opens the cairn.
- Glyphs in `#E8E3D8` on the `#0F1E17` base.

## Acceptance criteria

- [ ] With seeded cairns of 1 and 12 stones both on screen at z16, the two glyphs are **visibly different heights in a screenshot**, without zooming in to tell them apart.
- [ ] A cairn's glyph sits *on* its coordinate — at z18, the bottom stone is centered on a known lat/lng, not floating above or below it.
- [ ] Two cairns 10m apart both remain drawn. Neither disappears at any zoom level.
- [ ] Panning and pinch-zooming with ~40 cairns on screen produces no visible stutter on a physical iPhone.
- [ ] Tapping a glyph opens that cairn (logged id matches the seeded id). Tapping the map 30px away from any glyph opens nothing.
- [ ] A cairn whose stone count changes from 1 to 2 re-renders at the taller bucket after a feed refresh, without an app restart.
- [ ] Network inspector on the feed request shows positions and counts only — no `audio_url`, no `transcript`. (Belongs to CRN-005; check it here anyway, because this is the request a judge will open.)

## Not in this ticket

- The distance number next to the glyph and the blur/sharpen mechanic — E3, CRN-015.
- The cairn detail sheet contents and the stone thread — E4.
- Per-Space accent coloring of glyphs — E5. Build the glyph so it *can* be tinted; don't wire the theming.
- Clustering. At demo scale (four route cairns plus seeds) clustering solves a problem you do not have.
- Long-press-to-drop — that's E2 capture, on the same map but a different ticket.

## Notes & traps

- **`iconAllowOverlap: true` on the symbol layer.** Mapbox's default collision detection *hides* symbols that overlap, so two nearby cairns silently become one and a cluster of demo cairns looks like a broken feed. Set `iconAllowOverlap` (and `iconIgnorePlacement` if you add any text later). This is the most likely thirty-minute confusion in this ticket.
- **`iconAnchor: 'bottom'`.** Default anchor is center, which means a tall stack renders half below its own coordinate and the glyph looks progressively more wrong as the stack grows. Anchor at the bottom so stacks grow upward from the point.
- **Why not `MarkerView`:** each one is a real native view hosting React children, re-laid-out on every camera change. A few dozen tanks the frame rate on pan — and this is a demo where someone is *walking while the map moves*. `SymbolLayer` renders in GL and doesn't care. If you're at 11:35 with nothing on screen, `MarkerView` is an acceptable panic fallback for the four route cairns only, with a note to swap it back.
- **Register images through the library's `Images` component**, not by passing raw `require()` results into `iconImage`. The layer resolves image *names*, so the names you register must exactly match the bucket strings you write onto the features. A typo yields no icon and no error.
- **Tap handling:** put `onPress` on the `ShapeSource`, not the layer, and read the cairn id from `feature.properties.id` (or whatever CRN-005 names it), not from `feature.id`. Feature ids do not round-trip reliably through the native bridge; properties do. The press payload includes an array of hit features — take the first.
- **Per-feature tinting needs SDF icons.** `iconColor` only applies to images registered as SDF (monochrome alpha masks). If Space accent coloring is wanted later, the glyphs must be SDF from the start. Cheap insurance: author the PNGs as flat white-on-transparent silhouettes now, so flipping the SDF flag later is a one-line change rather than a redraw.
- Export the glyph assets at **@3x** and let the icon size expression scale down. Upscaled @1x art on an iPhone Pro looks like a hackathon.
- Bucket, don't interpolate. A unique glyph per count means unbounded assets and a layer expression nobody can debug at 14:00. Five images, five names, one `['get']`.
