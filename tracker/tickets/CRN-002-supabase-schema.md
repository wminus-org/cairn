---
id: CRN-002
title: "Supabase schema: all seven tables in one paste"
epic: E0 Foundation
priority: P0
status: todo
owner: unassigned
estimate: 30m
slot: "10:30"
depends_on: []
blocks: [CRN-003, CRN-004, CRN-005, CRN-009, CRN-018]
---

# CRN-002 — Supabase schema: all seven tables in one paste

**One SQL migration that creates `spaces`, `space_members`, `cairns`, `stones`, `pins`, `briefings` and `profiles`, with keys, indexes, and RLS enabled and denying by default on every table.**

## Why this exists

`PLAN.md` specifies seven tables and says explicitly: on Supabase this is one SQL paste. Doing it in one paste is the point — if the schema arrives in three instalments, every ticket downstream gets written against a moving target and someone spends the afternoon on `column does not exist`.

Storage paths (`CRN-003`), auth and profiles (`CRN-004`), the server-side proximity gate (`CRN-005`), cairn creation (`CRN-009`) and demo seeding (`CRN-018`) all read from this. Get it right once and nobody touches it again.

## Scope

One migration file, run once in the Supabase SQL editor. The annotated model with column-by-column reasoning lives in [`reference/data-model.md`](../reference/data-model.md) — this ticket is the execution.

Tables, following `PLAN.md` — plus three columns downstream tickets need (`stones.image_aspect_ratio`, `pins.unresolved`, `spaces.wordmark`), each reasoned below and documented in [`reference/data-model.md`](../reference/data-model.md). They are in the 10:30 paste so they are not three `ALTER TABLE`s and three schema-cache reloads in the afternoon:

| Table | Columns |
|---|---|
| `spaces` | `id`, `name`, `accent_hex`, `wordmark`, `join_code`, `created_by`, `created_at` |
| `space_members` | `space_id`, `user_id`, `role` |
| `cairns` | `id`, `space_id` (nullable), `lat`, `lng`, `title`, `created_by`, `created_at`, `radius_m` |
| `stones` | `id`, `cairn_id`, `author_id`, `kind`, `body_text`, `audio_url`, `image_url`, `image_aspect_ratio`, `transcript`, `created_at` |
| `pins` | `id`, `stone_id`, `x`, `y`, `note_text`, `audio_url`, `transcript`, `unresolved` |
| `briefings` | `cairn_id`, `generated_at`, `summary_text`, `audio_url` |
| `profiles` | `id`, `display_name`, `avatar_url` |

Types and constraints:

- `uuid` primary keys, `default gen_random_uuid()`. Two exceptions: `profiles.id` is not generated — it is `references auth.users(id) on delete cascade` — and `briefings` has no surrogate `id` at all (see below).
- All timestamps `timestamptz default now()`. Never `timestamp`.
- `lat` / `lng` as `double precision not null`. **No PostGIS.** Distance is a haversine expression inside the `CRN-005` RPC; adding an extension and a geography column buys nothing today and costs an index-type argument.
- `cairns.radius_m integer not null default 30`.
- `stones.kind text not null check (kind in ('voice','photo','text'))`.
- `stones.image_aspect_ratio numeric` — written at capture by `CRN-012`, divided by in `CRN-013` and `CRN-014` to lock the photo container. Not in the plan's column list; it is in the paste so nobody has to `alter table` at 13:15 and wait on a PostgREST schema-cache reload.
- `pins.x` / `pins.y` as `double precision not null check (x >= 0 and x <= 1)` — same for `y`. The constraint is the enforcement of the normalized-coordinates rule; make the database refuse pixels.
- `pins.unresolved boolean not null default false` — the terracotta flag demo cairn 2 requires and `CRN-014` renders. Not in the plan's column list; flagged and reasoned in `reference/data-model.md`, and in the paste for the same reason as `image_aspect_ratio`.
- `space_members` primary key is `(space_id, user_id)`. `role text not null check (role in ('owner','member')) default 'member'`.
- `briefings` primary key is `cairn_id` — no separate `id` column. One live briefing per cairn, so regenerating is an `upsert ... on conflict (cairn_id)` and reading one is a point lookup. A surrogate key would give you two rows per cairn, a "latest by `generated_at`" query, and an ordering bug on stage; `CRN-023` depends on this shape.
- `spaces.join_code text not null unique` — six characters, uppercase, generated client-side or by default expression, your call in `CRN-018`.
- `spaces.accent_hex text not null default '#D9A441'`.
- `spaces.wordmark text` — short string, ≤ 24 characters, rendered in the Space header by `CRN-021`. Nullable; personal mode has no wordmark.
- Foreign keys everywhere, with `on delete cascade` from `cairns` → `stones` → `pins` so deleting a bad seed cairn does not leave orphans.

Indexes that actually matter:

```
create index on cairns (space_id);
create index on stones (cairn_id);
create index on pins (stone_id);
create index on space_members (user_id);
```

Then, in the same paste, `alter table ... enable row level security;` on all seven tables and write **no policies**.

## Acceptance criteria

- [ ] The full migration runs top to bottom in a fresh Supabase SQL editor with zero errors and is re-runnable after a manual reset.
- [ ] All seven tables appear in the Table Editor with the columns above and the RLS badge showing enabled.
- [ ] `insert into pins (stone_id, x, y) values (<id>, 640, 480);` is rejected by the check constraint.
- [ ] `insert into stones (cairn_id, author_id, kind) values (<id>, <uid>, 'video');` is rejected by the check constraint.
- [ ] Two rows in `spaces` with the same `join_code` cannot both be inserted.
- [ ] A `select * from cairns` issued from the client with the **anon** key and no session returns zero rows and no error — default deny is live.
- [ ] Deleting a cairn removes its stones and their pins in one statement.
- [ ] The migration SQL is committed to the repo, not only pasted into the dashboard.

## Not in this ticket

Read and write policies for authenticated users — those are `CRN-005` (the proximity gate) and `CRN-020` (Space scoping), and writing them here guarantees they get written twice and disagree. The `handle_new_user` trigger that creates a `profiles` row on signup belongs to `CRN-004`. Storage buckets and their policies are `CRN-003`. Seed data is `CRN-018`.

## Notes & traps

- **RLS enabled with zero policies means nothing is readable by anon or authenticated.** That is intentional and it will look like the app is broken until `CRN-005` and `CRN-020` land. Say this out loud in the room so nobody "fixes" it with a `using (true)` policy at 13:00 and quietly deletes the product's only security property.
- **`service_role` bypasses RLS entirely.** That is exactly how the proximity gate works: the Edge Function holds the service key server-side, checks distance, and returns only what the caller has earned. It also means the service key must never reach the app bundle. Anon key in the client, service key in Edge Function secrets only.
- Prefer the `check` constraint over a real `enum` for `kind` and `role`. Adding a value to a Postgres enum is `alter type ... add value`, which has transaction restrictions and will surprise you; changing a check constraint is one statement you can run without thinking.
- `gen_random_uuid()` is built into Postgres 13+ via pgcrypto and is available on Supabase without an extension step. If it errors, `create extension if not exists pgcrypto;` at the top and move on.
- `profiles.id` referencing `auth.users` means you cannot insert a profile for a user that does not exist. Seeding fake authors for the eleven-stone demo cairn (`CRN-027`) therefore requires real auth users created first — worth knowing at 10:45 rather than 12:20.
- Nullable `cairns.space_id` is the personal-vs-Space distinction and it is load-bearing. `null` = personal collection. Do not add a sentinel "personal space" row; `CRN-020`'s policy reads much more cleanly against `is null`.
- Store `stones.audio_url` and `stones.image_url` as **storage object paths**, not URLs, despite the column names from the plan. Signed URLs are minted per request by the server (`CRN-003`, `CRN-005`) and expire; persisting one is a bug with a delay fuse. Keep the plan's column names, change what goes in them, and note it in `reference/data-model.md`.
- Column-name spelling is a contract with five other tickets. `lat`/`lng`, not `latitude`/`longitude`. `created_by`, not `user_id`. Match the plan character for character.
