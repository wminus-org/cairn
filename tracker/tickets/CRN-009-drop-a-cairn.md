---
id: CRN-009
title: Drop a cairn
epic: E2 Capture
priority: P0
status: todo
owner: unassigned
estimate: 35m
slot: "11:45"
depends_on: [CRN-002, CRN-008]
blocks: [CRN-011, CRN-012]
---

# CRN-009 — Drop a cairn

**Create a live cairn at a coordinate — long-press the map or drop at your current position — and open the capture sheet.**

## Why this exists

Feature 1 in the plan, and the first half of the 11:45 milestone. A cairn is the container every stone hangs off; nothing in E2, E3 or E4 can be built until rows exist. It is also the only moment ownership is decided — personal or Space — because a cairn cannot change hands later without retroactively changing who can hear every stone on it.

## Scope

- Two entry points, same code path:
  - `onLongPress` on the Mapbox `MapView` → the coordinate under the finger.
  - A "Drop here" button → the coordinate from the position hook in CRN-008.
- A confirm sheet before the insert: optional title (single line, ≤60 chars, blank is fine), destination selector (Personal, or any Space the user belongs to — default Personal), Cancel / Drop.
- Insert one `cairns` row: `lat`, `lng`, `title`, `created_by = auth.uid()`, `radius_m = 30`, `space_id = null` for personal or the selected Space id.
- On success the cairn is live. No draft state, no publish step. It renders on the map immediately as a single-pebble glyph with zero stones.
- The capture sheet opens straight after with two actions: Record (CRN-010 → CRN-011) and Photo (CRN-012). Both are optional; a cairn with no stones is a valid row.

## Acceptance criteria

- [ ] Long-pressing an empty patch of map opens the confirm sheet, and the coordinate shown to 5 decimal places matches the pressed point to within one glyph width.
- [ ] Dropping with the title field left empty succeeds and the cairn renders — `title` is nullable end to end.
- [ ] A cairn dropped to "Personal" has `space_id IS NULL` in the Supabase table editor; one dropped into a Space carries that Space's id.
- [ ] A cairn dropped through the app has `radius_m = 30` in its own row. Do not assert this table-wide — the 12:30 seed deliberately raises `radius_m` to 60–80 on the indoor demo cairns, and every render path reads the column per cairn.
- [ ] Drop at current position, then compare the row's `lat`/`lng` against the coordinate the position hook is reporting. They match. Swapped values land the cairn in the wrong hemisphere and are obvious on the map.
- [ ] Immediately after Drop, before any recording, the cairn is visible on the map. A zero-stone cairn must not vanish.
- [ ] There is no "move to Space" or "change owner" affordance anywhere in the cairn detail view.

## Not in this ticket

Recording (CRN-010), upload (CRN-011), photo capture (CRN-012). Glyph height as a function of stone count. Any proximity gating of cairn contents. Creating or joining a Space. Editing, moving or deleting a cairn.

## Notes & traps

- **Mapbox hands you `[longitude, latitude]`.** `onLongPress` on `MapView` gives a GeoJSON Feature whose `geometry.coordinates` is `[lng, lat]`, in that order. Your columns are `lat, lng`. Convert once at the boundary and never pass a bare two-element array further into the app.
- Test the long-press on a real device with a genuine ~500ms hold. On the simulator a click-and-hold behaves differently from a finger, and a map that pans instead of firing the handler is a gesture-settling problem, not a callback problem.
- `space_id` must be nullable in the CRN-002 schema **and** the RLS insert policy must permit `space_id IS NULL` as well as Space membership. If it only checks membership, personal drops fail with a 403 that surfaces in RN as a vague network error.
- Set `created_by` from `auth.uid()` — a column default or a `with check` clause — never from a client-supplied field.
- Hold the active Space in one app-level store now, not in the sheet's local state. CRN-012 and the Spaces tickets all need to read the same value, and a second source of truth for "which Space am I in" is a guaranteed afternoon bug.
- Immutable ownership is a deliberate constraint. Don't add the affordance "just in case" — moving a cairn into a Space would silently change the audience of every stone already on it.
