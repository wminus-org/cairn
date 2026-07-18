---
id: CRN-006
title: Mapbox contour-only base style
epic: E1 Map
priority: P0
status: todo
owner: unassigned
estimate: 40m
slot: "11:00"
depends_on: [CRN-001]
blocks: [CRN-007, CRN-008]
---

# CRN-006 — Mapbox contour-only base style

**One line.** — A Mapbox style that draws contour lines on `#0F1E17` and nothing else, wired into `MapView` with the camera opening over Technology Park.

## Why this exists

The plan's first design instruction is "stripped topographic base — contour lines only, no roads, no labels, no POI clutter." A default Mapbox basemap makes this look like every other hackathon map app. The contour base is also what makes the cairn glyphs from CRN-007 legible as terrain — bone-white stacks on bone-white contours over a dark field. Everything in E1 renders on top of this, so it lands before the glyph work.

## Scope

- A published Mapbox Studio style: background `#0F1E17`, a single line layer from the **Mapbox Terrain v2** tileset's `contour` layer in `#E8E3D8`, every other layer deleted (roads, labels, POI, admin boundaries, buildings, landuse, water fills).
- Contour line width and opacity ramped by zoom so the map reads at z13 and at z17 — thin and low-opacity when far out, heavier close in. Index contours (the `index` field on the contour layer) can carry slightly more weight if it's free; skip it if it isn't.
- The style URL committed to config (`mapbox://styles/<user>/<styleid>`) and passed to `MapView` via `styleURL`.
- Initial camera: centered on Technology Park, zoom ~16, applied on cold launch with no user interaction.
- `Mapbox.setAccessToken(<pk token>)` called once at app boot before any map component mounts.

## Acceptance criteria

- [ ] On a physical iPhone running the dev client, the map renders contour lines with **zero text glyphs anywhere on screen** at z13, z15, and z17 — pan around Ljubljana and confirm no street names, no place labels, no POI icons.
- [ ] Screenshot the map and sample it with a color picker: background is `#0F1E17`, contour lines are `#E8E3D8`.
- [ ] Cold-launching the app puts the camera over Technology Park at roughly building scale without the user touching anything.
- [ ] The style loads from a second device or a fresh app install — proving it's a **published** style, not a draft only visible to the account that authored it.
- [ ] The Mapbox logo and attribution are still visible on the map.
- [ ] No hardcoded `pk.*` token in a source file that is committed; it comes from config/env.

## Not in this ticket

- Cairn glyphs and any `ShapeSource` / `SymbolLayer` — that's CRN-007.
- User location dot, permissions, follow mode — CRN-008.
- Per-Space accent theming of the map — E5.
- 3D terrain, hillshade, or pitch. Flat map. Hillshade is in Terrain v2 and it is tempting; it is not on the board.

## Notes & traps

- **Timebox Studio to 15 minutes.** Fastest path: new style → start from a blank/empty template rather than a full basemap, add `mapbox://mapbox.mapbox-terrain-v2` as a vector source, add one line layer bound to its `contour` source layer, set a background layer to `#0F1E17`. Deleting ~80 layers off Dark one at a time is the slow path.
- **Fallback if Studio fights you:** (a) start from Mapbox Dark and delete the label/road layer *groups* in bulk, accepting an imperfect result, or (b) skip Studio and feed `MapView` a raw style JSON object instead of a URL — the component supports a style-JSON prop alongside `styleURL`; check the exact prop name in the installed version of `@rnmapbox/maps` before writing it. Either fallback ships. A missing map at 11:45 does not.
- **You must publish the style.** An unpublished draft resolves only for the authoring account's token and will render blank or 404 for anyone else. If the map is empty on a teammate's build, this is why.
- **Coordinate order is `[longitude, latitude]`.** Mapbox uses GeoJSON order everywhere — `centerCoordinate`, `Camera`, feature geometry. `expo-location` returns `{latitude, longitude}`. Swapping them silently drops you in the Indian Ocean or Somalia rather than throwing. Every single map bug today will be worth checking against this first.
- Technology Park Ljubljana is approximately `[14.472, 46.047]` (lng, lat) — **verify this against an actual GPS reading on-site before you seed anything in CRN-023-adjacent work**. Do not trust the number in this ticket for demo seeding; trust it enough to point the camera.
- The style URL is not a secret; the `sk.*` download token from CRN-001 is, and it is only needed at native build time. If the map renders, the `sk` token has already done its job — do not go looking for it at runtime.
- Contour geometry does not exist at low zoom in Terrain v2. If the map looks completely empty, zoom in before concluding the style is broken.
- Do not remove the Mapbox logo or attribution — it's a ToS requirement and repositioning it is a five-minute job you don't need today.
