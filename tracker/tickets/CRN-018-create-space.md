---
id: CRN-018
title: Create a Space with a join code
epic: E5 Spaces
priority: P1
status: todo
owner: unassigned
estimate: 30m
slot: "14:00"
depends_on: [CRN-002, CRN-004]
blocks: [CRN-019, CRN-027]
---

# CRN-018 — Create a Space with a join code

**One line.** — A signed-in user creates a Space with a name and an accent hex, the server mints a unique six-character join code, and the creator is written in as `owner` in the same transaction.

## Why this exists

Spaces are the business model. The demo's third cairn (the meeting room, eleven stones, "Brief me") is a Space cairn, so a Space has to actually exist before the demo seed in CRN-027 can be written. The join code is also the thing you say out loud on stage — "join code M7K2QP" — so it has to be legible when spoken.

## Scope

- `spaces` columns per the plan: `id, name, accent_hex, join_code, created_by`. Add `UNIQUE` on `join_code` and a `CHECK` that `accent_hex` matches `^#[0-9A-Fa-f]{6}$`.
- `space_members` with `CHECK (role IN ('owner','member'))` and a primary key on `(space_id, user_id)`.
- One Postgres function, `create_space(p_name text, p_accent_hex text)`, `SECURITY DEFINER`, that generates the code, inserts the space, inserts the creator as `owner`, and returns the new space row. Both inserts in one function call, not two round trips from the client.
- Code generator: 6 characters drawn from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`. No `0`, `O`, `1`, `I`, `L`. Stored uppercase.
- Uniqueness: retry the insert on `unique_violation`, up to 5 attempts, then raise.
- A create-Space screen: name field, accent swatch picker (offer the plan palette plus a free hex field), submit, then show the code big enough to read across a room.

## Acceptance criteria

- [ ] Calling `create_space` with `('Northside FM', '#D9A441')` returns one row containing a 6-character `join_code`, and `select count(*) from space_members where space_id = <new id> and role = 'owner'` returns 1.
- [ ] Generating 200 codes in a loop produces zero occurrences of the characters `0`, `O`, `1`, `I`, `L`.
- [ ] `insert into space_members (space_id, user_id, role) values (..., 'admin')` is rejected by the check constraint.
- [ ] Two spaces cannot share a join code: manually inserting a duplicate `join_code` fails on the unique index.
- [ ] Creating a Space with `accent_hex = 'red'` is rejected; `'#C0563A'` is accepted.
- [ ] After creating a Space in the app, the code is visible on screen without scrolling and readable from ~2m.

## Not in this ticket

- Joining by code — that's CRN-019.
- Any visibility or filtering behaviour for Space cairns — CRN-020 owns that, and it is the ticket that actually matters.
- Accent applied to map glyphs or a wordmark — CRN-021.
- Invites, member lists, removing members, transferring ownership, a third role. Two roles. Do not add a third.

## Notes & traps

- **The RLS chicken-and-egg will eat 20 minutes if you do this client-side.** A sane `space_members` insert policy is "you must already be a member of this space", which means nobody can ever insert the first row. Doing both inserts inside a `SECURITY DEFINER` function sidesteps it entirely. Do that first, not after you've fought the policy.
- **RLS recursion.** A `space_members` SELECT policy that itself queries `space_members` gives you `infinite recursion detected in policy for relation "space_members"`. Either restrict the policy to `user_id = auth.uid()`, or put the membership test in a `SECURITY DEFINER STABLE` helper function and call that from the policy.
- `auth.uid()` still returns the calling user's id inside a `SECURITY DEFINER` function — it reads the request's JWT claims, not the database role. Use it for `created_by`; do not accept a user id as a parameter.
- Set `search_path = public` on the function (`SET search_path = public` in the definition) and `grant execute ... to authenticated`. Without the grant the client gets a permission error that reads like the function doesn't exist.
- After creating any new function, PostgREST may 404 with "function not found in the schema cache". Fix: `NOTIFY pgrst, 'reload schema';` in the SQL editor. Budget zero minutes for this and you will spend fifteen.
- 6 chars from a 31-char alphabet is ~10^9 combinations. Collisions are a non-issue today; the unique index plus retry loop is four lines of insurance, not an optimisation.
- Pick the demo Space's name and accent now and write them down for CRN-027 and CRN-021. Regenerating a code mid-rehearsal because you forgot it is a self-inflicted wound.
