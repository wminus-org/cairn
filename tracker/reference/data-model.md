# Data model

Seven tables, one SQL paste. This is the file [`CRN-002`](../tickets/) points at — run [the block below](#the-paste) in the Supabase SQL editor at 10:30 and do not hand-edit the schema again unless something is actually broken.

Source of truth is [`PLAN.md`](../PLAN.md). Every column here maps to a line in its data model section, with three flagged exceptions ([`pins.unresolved`, `stones.image_aspect_ratio`, `spaces.wordmark`](#three-columns-beyond-the-plans-list)).

---

## The two rules that save an hour each

**1. Pin coordinates are normalized 0–1, never pixels.**
A pin at `x=0.42, y=0.71` means "42% across, 71% down" and renders correctly on a 390pt iPhone, a 1024pt iPad, in portrait, in landscape, on a downscaled thumbnail, and on the full-bleed photo view — with no stored image dimensions and no scaling math anywhere. Store pixels and you will spend the 14:00 hour working out why every pin on the second device is a hundred points off, and you will not have that hour. The `check (x between 0 and 1)` constraints in the schema exist to fail loudly at insert time the moment somebody passes `event.nativeEvent.locationX` straight through.

**2. Proximity filtering is server-side.**
Cairn positions and stone counts are public to any authenticated client. Audio URLs, image URLs, transcripts and body text are not — they are returned only by an RPC that computed the distance itself. A client-side gate is not a gate: the payload contains the content, the blur is CSS, and the first person to open the network inspector has defeated the product. A judge may well ask. See [Read path](#read-path-the-two-tier-contract) for the field-level contract.

---

## The paste

```sql
-- CAIRN schema. One paste. Supabase SQL editor, as the project owner.
-- Safe to re-run.

create extension if not exists pgcrypto;

-- 1. profiles -----------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Walker',
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- 2. spaces -------------------------------------------------------------
create table if not exists public.spaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  accent_hex text not null default '#D9A441',
  wordmark   text,
  join_code  text not null unique check (join_code ~ '^[A-Z0-9]{6}$'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 3. space_members ------------------------------------------------------
create table if not exists public.space_members (
  space_id   uuid not null references public.spaces(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

-- 4. cairns -------------------------------------------------------------
create table if not exists public.cairns (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid references public.spaces(id) on delete cascade,
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  title      text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  radius_m   integer not null default 30 check (radius_m > 0)
);

-- 5. stones -------------------------------------------------------------
create table if not exists public.stones (
  id         uuid primary key default gen_random_uuid(),
  cairn_id   uuid not null references public.cairns(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  kind       text not null check (kind in ('voice','photo','text')),
  body_text  text,
  audio_url  text,
  image_url  text,
  image_aspect_ratio numeric,
  transcript text,
  created_at timestamptz not null default now()
);

-- 6. pins ---------------------------------------------------------------
create table if not exists public.pins (
  id         uuid primary key default gen_random_uuid(),
  stone_id   uuid not null references public.stones(id) on delete cascade,
  x          double precision not null check (x >= 0 and x <= 1),
  y          double precision not null check (y >= 0 and y <= 1),
  note_text  text,
  audio_url  text,
  transcript text,
  unresolved boolean not null default false,  -- terracotta flag; see note
  created_at timestamptz not null default now()
);

-- 7. briefings ----------------------------------------------------------
create table if not exists public.briefings (
  cairn_id     uuid primary key references public.cairns(id) on delete cascade,
  generated_at timestamptz not null default now(),
  summary_text text,
  audio_url    text
);

-- Indexes ---------------------------------------------------------------
create index if not exists cairns_space_id_idx      on public.cairns (space_id);
create index if not exists stones_cairn_created_idx on public.stones (cairn_id, created_at);
create index if not exists pins_stone_id_idx        on public.pins (stone_id);
create index if not exists space_members_user_idx   on public.space_members (user_id);

-- RLS: default deny on everything. No policies yet, deliberately.
alter table public.profiles      enable row level security;
alter table public.spaces        enable row level security;
alter table public.space_members enable row level security;
alter table public.cairns        enable row level security;
alter table public.stones        enable row level security;
alter table public.pins          enable row level security;
alter table public.briefings     enable row level security;

-- Distance helper. Both proximity RPCs call this. Metres, haversine,
-- spherical earth. Accurate to ~0.5% which is far better than phone GPS.
create or replace function public.distance_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable
as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Auto-create a profile row on signup. Without this, author_id FKs fail
-- on the first stone and you debug it at 11:50.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'Walker'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

---

## Tables, column by column

### `profiles`

Mirrors `auth.users` so stones can carry an author name without a join into the auth schema (which the anon/authenticated roles cannot read).

| Column | Type | Why it exists |
|---|---|---|
| `id` | `uuid` PK → `auth.users.id` | Same id as the auth user. `auth.uid()` is directly usable as a profile id everywhere — no lookup table. |
| `display_name` | `text` not null | Rendered on every stone in the thread. "the last technician" is a display_name. |
| `avatar_url` | `text` | Cosmetic. Nothing breaks if it is null all day. |
| `created_at` | `timestamptz` | Free. |

### `spaces`

| Column | Type | Why it exists |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` not null | Header of the Nearby group and the Space chip on a cairn. |
| `accent_hex` | `text` not null, default `#D9A441` | The per-Space accent from the plan. Cairn glyphs on the map tint to this. Defaulting to amber means an un-themed Space still looks intentional. |
| `wordmark` | `text` | Short string, ≤ 24 chars, rendered in the Space header by `CRN-021`. Nullable; personal mode has no wordmark. |
| `join_code` | `text` not null unique | The entire invite flow. Six chars, `^[A-Z0-9]{6}$` enforced. The unique constraint gives you the lookup index for free. |
| `created_by` | `uuid` → `profiles.id` | Who to blame. Also seeds the first `space_members` row with role `owner`. |
| `created_at` | `timestamptz` | |

### `space_members`

| Column | Type | Why it exists |
|---|---|---|
| `space_id` | `uuid` → `spaces.id`, cascade | |
| `user_id` | `uuid` → `profiles.id`, cascade | |
| `role` | `text` check `owner \| member` | Two roles, no more, per the plan. Nothing in the MVP actually branches on role — it exists so the B2B story has an answer. |
| `created_at` | `timestamptz` | |

Composite PK `(space_id, user_id)`. That is not tidiness — it makes a double-tap on **Join** a no-op instead of a duplicate row, and lets you write the join as an upsert.

### `cairns`

| Column | Type | Why it exists |
|---|---|---|
| `id` | `uuid` PK | |
| `space_id` | `uuid` **nullable** → `spaces.id` | The whole visibility model. `null` = personal cairn. Non-null = visible only to members of that Space, who see nothing at all otherwise — not a locked marker, nothing. |
| `lat` | `double precision` not null | |
| `lng` | `double precision` not null | |
| `title` | `text` | Shown beyond 200m next to the distance number, so **it goes to every client that can see the cairn.** Never put the payload in the title. "Radiator, 2nd floor" yes; "valve leaking since March" no. |
| `created_by` | `uuid` → `profiles.id` | |
| `created_at` | `timestamptz` | |
| `radius_m` | `integer` not null, default 30 | Per-cairn unlock radius. It is a column and not a constant because if the venue's indoor GPS is bad at 15:00, widening the demo cairns is one `UPDATE` and not a rebuild. |

No spatial type, no PostGIS, no `cube`/`earthdistance`. At demo scale (tens of cairns) a sequential scan calling `distance_m` is sub-millisecond. Installing and learning PostGIS costs twenty minutes and buys nothing today.

### `stones`

One contribution to a cairn. The thread is `stones` ordered by `created_at` ascending.

| Column | Type | Why it exists |
|---|---|---|
| `id` | `uuid` PK | |
| `cairn_id` | `uuid` not null → `cairns.id`, cascade | |
| `author_id` | `uuid` → `profiles.id` | Byline in the thread. `on delete set null` so deleting a seed account does not delete the demo. |
| `kind` | `text` not null, check | `voice` \| `photo` \| `text`. See [below](#stoneskind). |
| `body_text` | `text` | The content of a `text` stone. **Gated** — this is user content. |
| `audio_url` | `text` | Storage path of the recording. **Gated.** |
| `image_url` | `text` | Storage path of the photo. **Gated.** |
| `image_aspect_ratio` | `numeric` | Written at capture by `CRN-012`; `CRN-013` and `CRN-014` divide by it to lock the photo container. |
| `transcript` | `text` | Filled by transcription on upload; pre-filled by the seed. Feeds "Brief me". **Gated.** |
| `created_at` | `timestamptz` not null, default `now()` | Thread order and the "three months" in the demo. **The seed overrides this.** |

A photo stone with pins is *one* row in `stones` plus N rows in `pins`. A stone that is both voice and photo is legal — set `kind='photo'` and fill `audio_url` too — but do not build UI for it today.

### `stones.kind`

Three values, enforced by a `check` constraint rather than a Postgres `enum` type.

| Value | Required columns | Optional |
|---|---|---|
| `voice` | `audio_url` | `transcript` |
| `photo` | `image_url` | `transcript` (of an attached voice note), pins in `pins` |
| `text` | `body_text` | — |

Why `check` and not `create type ... as enum`: adding a fourth kind at 14:00 is `alter table ... drop constraint / add constraint`, which is one statement inside a transaction. Extending a real enum is `alter type ... add value`, which has historically had transaction restrictions and will absolutely be the thing that eats ten minutes when you are already late. The check constraint gives you the same guarantee with none of the ceremony.

### `pins`

| Column | Type | Why it exists |
|---|---|---|
| `id` | `uuid` PK | |
| `stone_id` | `uuid` not null → `stones.id`, cascade | Pins hang off the photo stone, not the cairn. Delete the stone, the pins go. |
| `x` | `double precision`, `0 ≤ x ≤ 1` | Fraction across the image, left to right. **Normalized. Not pixels.** |
| `y` | `double precision`, `0 ≤ y ≤ 1` | Fraction down the image, top to bottom. **Normalized. Not pixels.** |
| `note_text` | `text` | Typed note. **Gated.** |
| `audio_url` | `text` | Voice note on this pin. **Gated.** |
| `transcript` | `text` | **Gated.** |
| `unresolved` | `boolean` not null, default false | Renders terracotta `#C0563A` instead of amber. |
| `created_at` | `timestamptz` | Pins are numbered 1, 2, 3 in the UI by `created_at` order. The number is **derived, not stored** — so you never have to renumber. |

Because coordinates are normalized, you never need to store image width or height, and you never need to know the display size at write time. Read the layout size at render, multiply, done.

#### Three columns beyond the plan's list

`pins.unresolved` is not in `PLAN.md`'s column listing, but demo cairn 2 requires "one unresolved flag in terracotta". A boolean is the cheapest way to get there and it costs nothing to carry. Flagged here so nobody thinks the schema drifted by accident. If you would rather not deviate, drop the column and encode it by convention — but then two people have to remember the convention, and one of them won't.

`stones.image_aspect_ratio` is likewise absent from the plan's listing. `CRN-012` writes it at capture, and `CRN-013` and `CRN-014` divide by it to lock the photo container to the right shape before the image has loaded — without it the container reflows on load and every normalized pin lands in the wrong place for one frame. A single `numeric` avoids that, and it is the one piece of image geometry worth storing precisely because pin coordinates are normalized and nothing else needs dimensions.

`spaces.wordmark` is the third. `CRN-021` renders it in the Space header — a short string, ≤ 24 characters, nullable, because personal mode has no wordmark. It is what makes a themed Space read as somebody's Space rather than a colour swap.

All three ship in the 10:30 paste above. That is deliberate: three afternoon `ALTER TABLE`s are also three PostgREST schema-cache reloads and three chances to hit `column does not exist` in a ticket that was written against the old shape. Carrying them from the start costs nothing.

### `briefings`

| Column | Type | Why it exists |
|---|---|---|
| `cairn_id` | `uuid` **PK** → `cairns.id`, cascade | Primary key on `cairn_id`, not a separate `id`. One live briefing per cairn, so regenerating is an `upsert` and reading is a point lookup — no "latest by generated_at" query, no ordering bug on stage. |
| `generated_at` | `timestamptz` | Lets you show "synthesised just now" and lets you decide a briefing is stale if stones were added after it. |
| `summary_text` | `text` | What TTS reads. **Gated.** |
| `audio_url` | `text` | Storage path of the TTS output, so the second press is instant. **Gated.** |

---

## Indexes

Four. On a six-hour build with a hundred rows, indexes are about not thinking, not about speed.

| Index | Query it serves |
|---|---|
| `cairns (space_id)` | Every map refresh filters personal vs. Space cairns. |
| `stones (cairn_id, created_at)` | The thread reads in exactly this order; also serves the stone-count aggregate for glyph height. |
| `pins (stone_id)` | Photo view loads all pins for one stone. |
| `space_members (user_id)` | "Which Spaces am I in" runs before every cairn query. |
| `spaces (join_code)` | Free — comes with the `unique` constraint. |

Do not add anything else. Nothing here will be slow today.

---

## Storage: what `audio_url` and `image_url` actually hold

They hold **object paths inside a private bucket**, not public URLs. Two buckets, per [`CRN-003`](../tickets/CRN-003-storage-buckets.md), which owns this layout: `cairn-audio` holds `{cairn_id}/{stone_id}.m4a` (voice stones), `{cairn_id}/{stone_id}/{pin_id}.m4a` (pin notes) and `briefings/{cairn_id}.m4a` (briefing audio, keyed by `cairn_id` — there is no `briefing_id`). `cairn-images` holds `{cairn_id}/{stone_id}.jpg`.

If the bucket is public, the proximity gate protects only the *discovery* of the path — the object itself is fetchable by anyone who has it. With a private bucket, the path is disclosed by the gated RPC and the client exchanges it for a short-lived signed URL. Paths are UUID-derived and therefore unguessable, which is the honest limit of what you can do in six hours: it is not a capability system, but it does mean the network payload for a far-away cairn contains nothing playable. That is the property a judge is checking.

---

## RLS posture

**Default deny, everywhere.** RLS is enabled on all seven tables and there are no `select` policies. Under PostgREST that means a direct `from('stones').select()` returns `[]` for `authenticated` and `anon` — an empty array, not an error, which is exactly how you will waste ten minutes thinking your query is broken. It isn't. Reads are not supposed to work that way.

**All reads go through `security definer` RPCs.** One place, not eleven policies.

The reasoning is not ideology, it is arithmetic. The visibility rule is *"caller is a member of the cairn's Space (or the cairn is personal and theirs) **and** caller's reported position is within `radius_m`"*. Expressed as RLS you would copy that predicate into a policy on `stones`, on `pins`, on `briefings`, and keep three copies in sync while tired. Worse, the proximity half **cannot** be expressed as a policy at all: the caller's position is an argument to the request, not a fact about the session, and there is nowhere for a policy to read it from. So the gate has to be a function that takes lat/lng. Once it is a function, having policies too is duplicated logic with two chances to be wrong.

`security definer` functions execute as the function owner and therefore bypass RLS on the tables they touch. That is the point. It also means the function body **is** the security boundary — there is no second net under it. Every one of them must:

- pin its search path: `set search_path = public, pg_temp` (an unpinned `security definer` function is a privilege-escalation vector, and Supabase's database linter will flag it);
- have `execute` revoked from `public` and granted only to `authenticated` — `execute` is granted to `PUBLIC` by default, and `PUBLIC` includes the `anon` role;
- derive identity from `auth.uid()` inside the function. Never accept a caller-supplied user id as a parameter. Position is an input; identity never is.

**Writes** are the exception worth making. A client inserting its own stone leaks nothing, so narrow `insert` policies on `cairns`, `stones` and `pins` (`with check (auth.uid() = author_id)` or equivalent) are fine and save you writing three more RPCs.

> Trap: with `insert`-only policies, `supabase.from('stones').insert(row).select()` fails — the `.select()` needs a `select` policy that deliberately does not exist. Call `.insert(row)` without `.select()` and generate the row id client-side (`crypto.randomUUID()`) so you already know it.

### Read path: the two-tier contract

| Tier | Who can call | Returns | Never returns |
|---|---|---|---|
| **1 — map / Nearby** | Any authenticated user, for cairns in their Spaces or their own | `id`, `lat`, `lng`, `title`, `space_id`, `accent_hex`, `stone_count`, `distance_m`, `radius_m` | `audio_url`, `image_url`, `transcript`, `body_text`, `note_text`, `summary_text` |
| **2 — cairn detail** | Same, **plus** server-computed `distance_m <= radius_m` | Full `stones` rows, their `pins`, the `briefing` | — (if the distance check fails, tier 2 returns no rows, not rows with nulls) |

Tier 1 must include `stone_count`, because glyph height encodes it and PostgREST's embedded `stones(count)` cannot work with no `select` policy on `stones`. Compute it in the RPC.

Two things to say out loud so nobody burns time on them:

- **The 200m→30m blur has no partial data behind it.** Nothing decrypts halfway. The waveform that sharpens as you walk is generated locally from the stone id; the real audio arrives in one step, at tier 2, when you are inside `radius_m`. That is a rendering trick and it is the correct rendering trick.
- **A client can lie about its GPS position.** Yes. That is a person claiming to be somewhere they are not, which is a different and much smaller problem than every client holding every audio URL at all times. Do not build spoofing defences today.

RPC bodies live in the server-side gate ticket, not here. `distance_m()` is in the paste above because both tiers call it.

---

## What the seed writes directly

Seeding happens three different ways, and conflating them wastes time at 12:30:

| What | How | Why that way |
|---|---|---|
| The four route cairns (`CRN-026`) | **Through the app**, on a physical device, using the drop flow (`CRN-009`) and upload (`CRN-011`) | The coordinates and audio have to be real, captured on site. Seeding these through SQL would skip the one dress rehearsal that finds `CRN-011` bugs while there is still time to fix them. |
| The eleven-stone Space cairn (`CRN-027`) | **SQL editor**, service_role, from a re-runnable `supabase/seed/space-cairn.sql` | Eleven stones from four authors backdated across three months cannot be produced by walking around. It must be re-runnable so a botched demo state is one paste away from clean. |
| The four demo accounts (`CRN-004`) | **Node script**, service_role | Creating `auth.users` rows needs the admin API, not the SQL editor. |

service_role bypasses RLS, which is the entire reason the latter two can write what they write. Never let that key near the client bundle — it goes in a local script or the SQL editor, never in Expo, never in `EXPO_PUBLIC_*`.

Columns the seed sets explicitly rather than letting defaults handle:

| Column | Why the seed must set it |
|---|---|
| `stones.created_at` | **The big one.** Demo cairn 3 needs eleven stones from four people spanning three months. `now()` is the default, so `created_at` must appear in the `insert` column list with an explicit backdated timestamptz per stone. Spread them unevenly — eleven evenly spaced stones look generated, because they are. |
| `stones.transcript` | **Pre-fill it.** Do not run seed audio through the live transcription pipeline: it costs minutes you don't have and it can fail at 15:20 for reasons unrelated to your code. "Brief me" reads transcripts; give it good ones. |
| `stones.author_id` | Four distinct authors. See the trap below. |
| `stones.kind` | Explicit per row — no default exists. |
| `cairns.lat` / `lng` | Coordinates **walked and read off the device at the venue**, not picked off a map website. A door you stand at and a pin you drop on a satellite view are twenty metres apart, and twenty metres is most of your radius. |
| `cairns.radius_m` | Override to 60–80 for the indoor cairns (corridor, meeting room, stage). The 30m default is correct outdoors and wrong under a concrete ceiling. |
| `cairns.space_id` | `null` for cairns 1, 2 and 4; the demo Space's id for cairn 3. |
| `spaces.join_code` | A fixed, memorable, typeable code. Not random — you may need to type it on stage. |
| `pins.x` / `y` | Normalized fractions measured against the actual seeded photo. Take the photo first, then place the pins. |
| `pins.unresolved` | `true` on exactly one pin of demo cairn 2. That is the terracotta flag. |
| `briefings.*` | Pre-generate a briefing row for demo cairn 3 as a fallback. Live generation is the better moment; a pre-baked row is what you fall back to if the model call hangs on stage Wi-Fi. Decide which one the button uses at 15:00, not at 16:25. |

> **Trap: `profiles.id` is a foreign key to `auth.users.id`.** You cannot invent four fake authors by inserting four rows into `profiles` — the FK will reject them. Create the accounts through the Auth Admin API (`auth.admin.createUser`, service_role only), which fires the `on_auth_user_created` trigger and gives you real profile rows; then `update` their `display_name`. Budget five minutes for this and discover it at 12:30, not at 15:45.

Also seed the storage objects (audio, photos) **before** the rows that reference them, so no `audio_url` ever points at a path that isn't there.
