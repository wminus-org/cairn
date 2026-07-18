---
id: CRN-020
title: Space-scoped visibility
epic: E5 Spaces
priority: P1
status: todo
owner: unassigned
estimate: 30m
slot: "14:00"
depends_on: [CRN-005, CRN-019]
blocks: [CRN-021]
---

# CRN-020 — Space-scoped visibility

**One line.** — Every cairn belongs to a personal collection or exactly one Space, and a non-member gets nothing back for a Space cairn — no marker, no glyph, no count — even standing on the exact coordinate.

## Why this exists

The plan states it in one sentence: *"Space cairns are invisible to non-members even when standing on them — the map shows nothing at all, not a locked marker."* A greyed-out padlock tells a competitor that a Space exists, where it operates, and how much activity it has. That's a leak dressed as a feature. This is also the second half of the server-side gate: CRN-005 decides *what you may hear*, this decides *what exists for you at all*.

## Scope

- `cairns.space_id` nullable. `NULL` means the personal collection of `created_by`.
- Extend the proximity RPC from CRN-005 — the *same* function, not a second one — with the membership predicate in its `WHERE` clause:
  - `space_id is null and created_by = auth.uid()`, OR
  - `space_id in (select space_id from space_members where user_id = auth.uid())`.
- The predicate runs before proximity. A non-member is filtered out at any distance including zero.
- No `select` policy on `cairns`. Default-deny stays; the membership predicate lives in the RPC body only, once. A client bypassing the RPC gets `[]` because nothing is directly readable — which is the same outcome, with one copy of the rule.
- The map query is driven by the active Space plus the personal collection. Cairn drop (CRN-009) writes `space_id` from the active Space, or `null` when the user is in personal mode.
- Stone counts, titles and coordinates for Space cairns are subject to the same rule. Membership gates everything; proximity gates only media and transcripts.

## Acceptance criteria

- [ ] Device A (member) sees the Space cairn on the map. Device B (signed in, not a member), standing at the exact same coordinate, sees no marker.
- [ ] For device B, the RPC's raw HTTP response body for that region is `[]` — verified in the network inspector or via `curl` with B's JWT, not by looking at the screen.
- [ ] Direct `select * from cairns` from device B with the anon key returns zero rows for that Space's cairns.
- [ ] The response for device B contains no `title`, no `stone_count` and no `id` for any Space cairn it isn't entitled to — grep the raw body for the cairn's title string and get no hit.
- [ ] After device B joins the Space via CRN-019 and the map refetches, the same cairn appears, with proximity behaviour (CRN-005 / the blur mechanic) unchanged.
- [ ] A personal cairn created by A is not returned to B at any distance.
- [ ] With no session at all (anon, `auth.uid()` is null), the RPC returns zero rows rather than everything.

## Not in this ticket

- The proximity distance thresholds and the blur/sharpen render — CRN-005 and the E3 tickets.
- Accent colour or wordmark on the returned cairns — CRN-021.
- Per-cairn sharing, guest links, public Spaces, per-stone permissions.
- Moving an existing cairn between a Space and the personal collection.

## Notes & traps

- **`SECURITY DEFINER` bypasses RLS.** If CRN-005's RPC is `SECURITY DEFINER` — and it probably is, since it needs to compute distance across all cairns — then RLS on `cairns` does *nothing* inside it. The membership predicate must be written literally in the function body. Assuming "RLS has it covered" is the single most likely way this ticket ships broken and looks fine.
- Test the negative case as a *different logged-in user*, not by logging out. Logged-out often fails for boring reasons and gives you a false pass.
- `auth.uid()` returns null for an anon request. Check your predicate's null behaviour: `created_by = auth.uid()` is null (not true) so personal cairns are correctly excluded, but if you wrote anything as `coalesce(...)` or `or space_id is null` without the `created_by` half, every personal cairn in the database leaks to anonymous callers. Read that clause twice.
- Don't add a second "list cairns" endpoint for the Nearby list (E7). It will get the membership rule and miss it, or get it and drift. One RPC, both surfaces.
- Membership and proximity are different gates and it's easy to conflate them. Positions and stone counts may go to *any client that is entitled to see the cairn at all*. A non-member is not entitled, so they get nothing. Say it that way if a judge asks.
- The client must refetch on active-Space change and after a join. A stale cache here reads as "the visibility rule is broken" during rehearsal and you'll go debugging SQL that is fine.
- Index `space_members (user_id, space_id)`. The `in (...)` subquery runs on every map pan.
