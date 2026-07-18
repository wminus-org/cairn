---
id: CRN-019
title: Join a Space by six-character code
epic: E5 Spaces
priority: P1
status: todo
owner: unassigned
estimate: 20m
slot: "14:00"
depends_on: [CRN-018]
blocks: [CRN-020]
---

# CRN-019 — Join a Space by six-character code

**One line.** — Type a six-character code, hit join, and become a `member` of that Space via a server-side RPC that never exposes the `spaces` table to code lookups.

## Why this exists

The only way into a Space. On stage this is how you show the team mode: a second device joins with the code you just read aloud, and the Space's cairns appear on a map that was empty a second earlier. It has to work first try with a fat thumb on a phone.

## Scope

- `join_space_by_code(p_code text)`, `SECURITY DEFINER`, returning the joined space row (`id, name, accent_hex`) so the client can switch to it immediately.
- Normalise input server-side: `upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'))`. Uppercase, strip spaces and hyphens.
- No matching space → raise a distinct error the client can map to "That code doesn't match a Space."
- Already a member → succeed and return the space, no duplicate row, no error. `on conflict (space_id, user_id) do nothing`.
- New member gets `role = 'member'`. Never `owner`.
- Join screen: single 6-character input, auto-uppercase display, `autoCapitalize="characters"`, `autoCorrect={false}`, and on success set the active Space and pop back to the map.
- Active Space is client state (store + persisted key). Switching it re-runs the cairn query from CRN-020.

## Acceptance criteria

- [ ] Entering the code in lowercase with a trailing space (` m7k2qp `) joins successfully.
- [ ] `select role from space_members where space_id = <id> and user_id = <joiner>` returns `member`, not `owner`.
- [ ] Joining the same Space twice produces exactly one row in `space_members` and no visible error on the second attempt.
- [ ] Entering `ZZZZZZ` shows "That code doesn't match a Space" and creates no membership row.
- [ ] A signed-in user who is not a member calls `select * from spaces` directly from the client with the anon key and receives zero rows for Spaces they don't belong to — checked in the network response body, not in the UI.
- [ ] Immediately after joining, the map/nearby surface shows that Space's cairns without a manual app restart.

## Not in this ticket

- Creating a Space, generating codes — CRN-018.
- The visibility rule itself, and the negative case of standing on a Space cairn as a non-member — CRN-020.
- Leaving a Space, member lists, kicking, code rotation, QR or deep-link invites.
- Rate limiting or brute-force protection. Six characters is enough for today; note it as a known limitation if a judge asks rather than building it.

## Notes & traps

- **This is why it must be an RPC.** If the client can run `select * from spaces where join_code = $1`, it can also run `select join_code from spaces` and walk every Space in the database. The `spaces` SELECT policy must be "id is in my `space_members`" with no exception for code lookup, and the lookup happens inside the `SECURITY DEFINER` function where RLS doesn't apply. A "temporary" permissive policy here is exactly the thing that survives to the demo.
- Because the function bypasses RLS, write the membership insert against `auth.uid()` explicitly. Never take a user id as a parameter — that turns the RPC into "add anyone to any Space."
- Return a *typed* failure, not `null` — a `raise exception ... using errcode = 'P0001'` with a message you can match, or an explicit status column. Distinguishing "bad code" from "network died" matters when you're debugging on stage.
- The code alphabet has neither `0`/`O` nor `1`/`I`/`L` (CRN-018), so a typed `0` or `I` is unambiguously a typo and can only ever be a miss. Don't build character-folding logic; it's dead code.
- `grant execute on function join_space_by_code(text) to authenticated;` and `SET search_path = public`. If PostgREST 404s the function, `NOTIFY pgrst, 'reload schema';`.
- After joining, invalidate the cairn query cache. If you only set the active-Space state without a refetch, the map stays empty and it looks like the whole feature is broken when it isn't.
- Keep the join screen reachable in two taps from the map. During rehearsal you'll do this a dozen times.
