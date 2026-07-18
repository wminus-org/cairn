# Proximity gate tests

The plan's first non-negotiable is that proximity filtering happens **server-side**: a client that is not standing at a cairn must never receive its audio URLs, transcripts or pins, and a non-member of a Space must see nothing at all — not a locked marker. A judge may open the network inspector.

These tests prove that against a real Postgres, without needing a Supabase project.

## How they work

`00_local_shim.sql` stands up just enough of Supabase — the `anon` / `authenticated` / `service_role` roles, `auth.users`, `auth.uid()`, and the `storage` schema — that the migrations can run on bare Postgres. It is a test fixture, **not** part of the migration set. Never apply it to a real project.

`01_proximity_gate_test.sql` plants sentinel strings (`SENTINEL-AUDIO-LEAK`, `SENTINEL-TRANSCRIPT-LEAK`) in a stone, then asserts on the *text of the whole response*. If a sentinel appears anywhere in a response it should not be in, the test fails — regardless of which field it leaked through. Blunt on purpose, and hard to fool.

## Running them

Needs Docker and `psql`.

```bash
docker run -d --name cairn-pg -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:15-alpine
export PGPASSWORD=pw
PSQL="psql -h localhost -p 55432 -U postgres -v ON_ERROR_STOP=1"

$PSQL -f supabase/tests/00_local_shim.sql
for f in supabase/migrations/*.sql; do $PSQL -f "$f"; done
$PSQL -f supabase/tests/01_proximity_gate_test.sql
```

Expected: **10 passed, 0 failed.**

Tear down with `docker rm -f cairn-pg`.

## What is covered

| # | Assertion |
|---|---|
| 1–2 | `distance_m()` is accurate — 0.01° of latitude resolves to 1111.95 m, identical points to 0 |
| 3–4 | At 500 m the owner gets `band: far`, an empty `stones` array, and no audio or transcript |
| 5 | At 120 m — inside the blur band — stone stubs appear but audio and transcript are still withheld |
| 6–7 | At 0 m both are released |
| 8 | A non-member standing **exactly on** a Space cairn gets `cairn not found`, not a redacted marker |
| 9 | `cairns_nearby` omits Space cairns entirely for non-members |
| 10 | `cairns_nearby` still lists a personal cairn from 4.4 km away — positions are public, content is not |

## Checked separately

Run as the `authenticated` role, these hold:

- Direct `select` on `stones`, `pins` and `briefings` fails with **permission denied**. Reads only happen through the gated RPCs, so PostgREST exposes no bypass.
- `cairns_nearby`, `cairn_detail` and `stack_stone` all execute normally — the lockdown does not break the app. Both halves matter: a gate nobody can call is as broken as one that leaks.

## The gap these tests do not close

The shim approximates Supabase; it is not Supabase. Storage RLS in particular is only sketched, and signed-URL TTLs are not exercised at all. After applying the migrations to the real project, re-check by hand that the buckets are **private** and that no code path hands a client a permanent public URL.
