---
id: CRN-017
title: Stack a stone onto an existing cairn
epic: E4 Stacking
priority: P0
status: todo
owner: unassigned
estimate: 25m
slot: "14:30"
depends_on: [CRN-010, CRN-016]
blocks: []
---

# CRN-017 — Stack a stone onto an existing cairn

**From inside the stone thread, anyone standing at a cairn can add their own stone — voice, photo, or text — and the server re-checks proximity and Space membership before the insert lands.**

## Why this exists

Stacking is the collaborative act the whole vocabulary is built around; without it a cairn is a voicemail, not a place with a history. It is also the live beat in the demo: cairn 4 is dropped the morning of, and stacking onto it in front of the room proves the thing is a running system and not seeded fixtures.

## Scope

- An "add stone" affordance pinned to the bottom of the thread from CRN-016, active only inside the cairn's `radius_m`. Outside it, the control renders disabled with the distance in mono — visible but not usable, so the mechanic is legible rather than hidden.
- Reuse the capture sheet from CRN-010 unchanged: hold-to-record voice (60s cap), photo, or text. No second capture UI.
- Write path is a single `SECURITY DEFINER` Postgres function that takes the cairn id, the stone kind, the storage path or body text, and the caller's current lat/lng. It must, in this order:
  1. resolve `auth.uid()` server-side and reject anonymous callers,
  2. if the cairn has a `space_id`, confirm the caller has a row in `space_members` for that Space,
  3. compute distance from the caller's coordinates to the cairn and reject beyond `radius_m`,
  4. insert the stone with `author_id` set from `auth.uid()`.
- Media uploads to Supabase Storage happen first; the function receives the resulting **object path**, never a signed URL, never a base64 blob.
- Optimistic append: the new stone appears at the top of the thread immediately in a pending state, then reconciles with the server row or rolls back with a terracotta `#C0563A` error line.
- The cairn's stone count updates so the map glyph grows on the next map read.

## Acceptance criteria

- [ ] Standing at a cairn, recording a voice stone and releasing puts a new stone at the top of the thread within 3 seconds, with your own display name and today's timestamp.
- [ ] The new stone survives a full app reload — it is a database row, not local state.
- [ ] Calling the insert function directly with coordinates 4km from the cairn (curl or the Supabase SQL editor, same authenticated user) returns an error and inserts nothing. Row count before and after is identical.
- [ ] Calling the insert function as a user who is not a member of the cairn's Space returns an error and inserts nothing, even with correct coordinates.
- [ ] Calling with an `author_id` in the payload set to another user's id produces a row owned by the caller, not the spoofed id — or is rejected. It never attributes the stone to someone else.
- [ ] A direct `insert into stones` from an authenticated client, bypassing the function, is refused by RLS.
- [ ] Text and photo stones can both be stacked and render correctly in the CRN-016 thread without a reload.
- [ ] The glyph for that cairn on the map is one stone taller after the map is next read.
- [ ] Killing the network mid-upload leaves the thread readable, shows a terracotta failure line, and does not leave a permanent phantom stone.

## Not in this ticket

- Creating a new cairn — that is the drop flow, CRN-010's neighbours in E2.
- Placing pins on a photo stone — CRN-014 owns pin creation.
- The thread rendering itself — CRN-016.
- Editing or deleting a stone after it lands. Explicitly out of scope per the plan.
- Notifying other members that a stone was added. Out of scope, and push is a two-hour hole.

## Notes & traps

- **Read access is not write access.** Proximity for reads is enforced in CRN-005; that function's checks do not apply to inserts. A client that legitimately fetched a cairn's position from the map now holds the id and could POST to it from anywhere. The write path needs its own membership and distance checks or the gate has a hole shaped like the entire product.
- **RLS alone cannot do this.** An `INSERT` policy on `stones` can check `auth.uid()` and Space membership, but the device's current position does not exist in the database, so no policy can see it. Proximity has to arrive as a function argument. Therefore: keep the RLS insert policy restrictive (or absent), `revoke insert on stones from authenticated`, and make the `SECURITY DEFINER` function the only way in. If both paths work, the loose one is the one that ships.
- **`SECURITY DEFINER` needs a pinned `search_path`.** Set it explicitly (`set search_path = public, pg_temp` in the function definition) or Supabase's linter flags it and, worse, the function can be tricked into resolving the wrong table.
- **Skip PostGIS.** Enabling and reasoning about the extension costs more than it saves at 14:30. Write the haversine inline in plpgsql against `lat`/`lng` doubles with an earth radius of 6371000. Guard against `null` coordinates — a cairn seeded without a position must fail closed, not compute `NaN` and pass.
- **The client can lie about its coordinates, and that is acceptable today.** The requirement is that the decision is made on the server, not that GPS is unspoofable. Say that out loud if a judge asks rather than claiming more than the design delivers — attestation is a real answer for a real product and a wrong answer for a hackathon.
- **Foreground location only.** Use `expo-location`'s foreground permission and read the position at the moment of the insert, not a value cached when the screen mounted. Background location is explicitly out of scope and will eat two hours. Request the permission before the user holds to record, not after — an iOS permission dialog appearing mid-hold cancels the gesture and loses the recording.
- **Demo mode must feed this function too.** If the venue's GPS is bad indoors and position is overridden along a fixed route, the override has to flow into the coordinates sent to the insert RPC, or stacking fails on stage while reading works. Check this during the 15:00 demo-mode decision, not at 16:25.
- **Upload then insert, and never the reverse.** A stone row with a storage path that does not exist yet renders as a broken player in the thread. Await the Storage upload, take the returned path, then call the function.
- **Optimistic rows need a distinguishable local id.** Reconcile on the server id when it returns, or the eleven-stone demo cairn briefly shows twelve.
