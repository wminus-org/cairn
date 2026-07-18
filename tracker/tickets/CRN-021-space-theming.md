---
id: CRN-021
title: "Space theming: accent and wordmark"
epic: E5 Spaces
priority: P2
status: todo
owner: unassigned
estimate: 25m
slot: "14:00"
depends_on: [CRN-007, CRN-020]
blocks: []
---

# CRN-021 — Space theming: accent and wordmark

**One line.** — A Space's `accent_hex` tints its cairn glyphs on the map and its wordmark sits in the Space header, so the team mode reads as a product with a customer rather than a reskin.

## Why this exists

Straight from the plan: *"A company sets an accent color and a wordmark. Their cairns render in that accent on the map. Costs nothing to build and makes the B2B demo look like a product rather than a hackathon skin."* When you turn from the consumer moment to the team mode, the map changing colour and a wordmark appearing does the pitch work that a sentence would otherwise have to.

## Scope

- `spaces.wordmark text` already exists — it ships in CRN-002's 10:30 paste (nullable, ≤ 24 chars, rendered in the app typeface). Read it; do not `ALTER TABLE`.
- The cairn RPC from CRN-020 returns `accent_hex` per cairn, joined from `spaces`. Personal cairns return null and fall back to amber `#D9A441`.
- Map glyph colour is driven off the feature property with a Mapbox style expression, e.g. `['coalesce', ['get', 'accent_hex'], '#D9A441']` — one layer, data-driven. Not one layer per Space.
- Space header: wordmark text on base `#0F1E17`, accent used for the underline/rule and for the active-Space chip. Contour and body type stay `#E8E3D8`.
- Unresolved/alert stays terracotta `#C0563A` regardless of Space accent. It is a status colour, not a brand colour.

## Acceptance criteria

- [ ] With the demo Space active, its cairn glyphs render in the Space accent while personal cairns on the same screen stay amber `#D9A441` — both visible in one screenshot.
- [ ] Changing `spaces.accent_hex` in the SQL editor and pulling to refresh changes the glyph colour without an app rebuild.
- [ ] The Space wordmark appears in the header when a Space is active and is absent in personal mode.
- [ ] A terracotta unresolved marker still renders terracotta inside a Space with a non-amber accent.
- [ ] The map still renders correctly when `accent_hex` is null or the join misses — no crash, no invisible glyph, falls back to amber.

## Not in this ticket

- Uploading a wordmark image, logo files, Storage plumbing. Text only.
- A colour picker beyond the swatch row already in CRN-018.
- Theming anything outside the map glyph and Space header — no per-Space map base style, no per-Space app chrome, no light mode.
- Contrast auto-correction. Pick a good accent for the demo Space instead.

## Notes & traps

- **This is the first thing to cut.** P2, pure polish. If it's 15:00 and this isn't done, hardcode the demo Space's accent as a constant in the theme file and move on — that's two minutes and 90% of the visual payoff. Do not start it before CRN-020 is verified.
- Mapbox layer style props take expressions as plain JS arrays; a data-driven colour is `['get', 'accent_hex']` where `accent_hex` is a property on the GeoJSON feature, so the value has to be inside the feature's `properties`, not alongside it. If every glyph comes out the fallback colour, that's almost always where it went wrong.
- If the glyphs are rendered as an image/`SymbolLayer` sprite, colour won't apply unless the icon is an SDF; a `CircleLayer` or a shape you can fill directly is the fast path. Don't spend the 25 minutes fighting sprite tinting — swap the mark instead.
- Arbitrary accents on `#0F1E17` can be nearly invisible (dark green, navy, black). Validate the hex format in CRN-018 and choose a known-good accent for the demo Space yourself. Nothing about this is worth a runtime luminance check today.
- Remember to also update the RPC's return type when you add `accent_hex` to it. Changing a function's `returns table (...)` signature needs a `drop function` first if the column list changes; a plain `create or replace` will error.
