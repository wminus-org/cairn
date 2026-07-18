-- =====================================================================
-- CAIRN — 0001_schema.sql
-- CRN-002. The "one SQL paste" from PLAN.md. Seven tables, keys,
-- indexes, RLS enabled and denying by default, and distance_m().
--
-- !! THIS FILE HAS NOT BEEN EXECUTED. !!
-- There is no Postgres and no Docker on the machine that wrote it.
-- It is written to be correct by construction and has been read, not run.
-- Run the four files IN ORDER in the Supabase SQL editor, as the project
-- owner, checking after each:
--     0001_schema.sql   <- you are here
--     0002_storage.sql
--     0003_auth.sql
--     0004_proximity_gate.sql
--
-- Safe to re-run. Nothing here drops or truncates a table.
--
-- Deliberately NOT in this file: any RLS policy at all. RLS is turned on
-- with zero policies, which means anon and authenticated read nothing.
-- That is the product's only security property, not a bug. Do not "fix"
-- it with `using (true)` at 13:00. Policies arrive in 0003 and 0004.
-- =====================================================================

create extension if not exists pgcrypto;

-- 1. profiles ---------------------------------------------------------
-- Mirrors auth.users so a stone can carry an author name without joining
-- into the auth schema, which authenticated cannot read.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Walker',
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- 2. spaces -----------------------------------------------------------
create table if not exists public.spaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- Per-Space accent. Defaults to amber so an un-themed Space still looks
  -- intentional. Regex check per CRN-018: 'red' is rejected, '#C0563A' is not.
  accent_hex text not null default '#D9A441' check (accent_hex ~ '^#[0-9A-Fa-f]{6}$'),
  wordmark   text,
  -- Six chars, uppercase. The unique constraint is also the lookup index
  -- for join-by-code, for free.
  join_code  text not null unique check (join_code ~ '^[A-Z0-9]{6}$'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 3. space_members ----------------------------------------------------
-- Composite PK is not tidiness: it makes a double-tap on Join a no-op
-- instead of a duplicate row, and lets CRN-019 write the join as an upsert.
create table if not exists public.space_members (
  space_id   uuid not null references public.spaces(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

-- 4. cairns -----------------------------------------------------------
-- space_id NULL = personal collection of created_by. That nullability is
-- the entire visibility model (CRN-020). No sentinel "personal space" row.
create table if not exists public.cairns (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid references public.spaces(id) on delete cascade,
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  -- title ships to every client entitled to see the cairn, at any distance.
  -- Never put the payload in the title.
  title      text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- A column, not a constant, so widening the indoor demo cairns at 15:00
  -- is one UPDATE and not a rebuild. Read per cairn, never hardcoded.
  radius_m   integer not null default 30 check (radius_m > 0)
);

-- 5. stones -----------------------------------------------------------
-- audio_url / image_url hold STORAGE OBJECT PATHS, not URLs, despite the
-- column names inherited from PLAN.md. Signed URLs are minted per request
-- by the Edge Function in CRN-005 and expire; persisting one is a bug with
-- a delay fuse.
create table if not exists public.stones (
  id         uuid primary key default gen_random_uuid(),
  cairn_id   uuid not null references public.cairns(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  -- check constraint, not a Postgres enum: adding a fourth kind at 14:00 is
  -- one drop/add statement inside a transaction, where `alter type ... add
  -- value` is not.
  kind       text not null check (kind in ('voice','photo','text')),
  body_text  text,
  audio_url  text,
  image_url  text,
  -- Written at capture by CRN-012; CRN-013/014 divide by it to lock the
  -- photo container before the image loads, so normalized pins do not land
  -- wrong for one frame.
  image_aspect_ratio numeric,
  transcript text,
  created_at timestamptz not null default now()
);

-- 6. pins -------------------------------------------------------------
-- x and y are NORMALIZED 0-1 fractions of the image, never pixels. The
-- check constraints exist to fail loudly the moment somebody passes
-- event.nativeEvent.locationX straight through.
create table if not exists public.pins (
  id         uuid primary key default gen_random_uuid(),
  stone_id   uuid not null references public.stones(id) on delete cascade,
  x          double precision not null check (x >= 0 and x <= 1),
  y          double precision not null check (y >= 0 and y <= 1),
  note_text  text,
  audio_url  text,
  transcript text,
  unresolved boolean not null default false,  -- renders terracotta #C0563A
  created_at timestamptz not null default now()  -- pin numbers derive from this order
);

-- 7. briefings --------------------------------------------------------
-- PK is cairn_id, no surrogate id. One live briefing per cairn, so
-- regeneration is `on conflict (cairn_id) do update` and reading is a point
-- lookup — no "latest by generated_at" query and no ordering bug on stage.
create table if not exists public.briefings (
  cairn_id     uuid primary key references public.cairns(id) on delete cascade,
  generated_at timestamptz not null default now(),
  summary_text text,
  audio_url    text
);

-- Indexes -------------------------------------------------------------
-- Five. On a hundred rows these are about not thinking, not about speed.
create index if not exists cairns_space_id_idx        on public.cairns (space_id);
create index if not exists stones_cairn_created_idx   on public.stones (cairn_id, created_at);
create index if not exists pins_stone_id_idx          on public.pins (stone_id);
-- (user_id, space_id) per CRN-020: the `exists (...)` membership check runs
-- on every map pan.
create index if not exists space_members_user_idx     on public.space_members (user_id, space_id);
-- spaces (join_code) comes free with the unique constraint.

-- RLS: default deny on all seven tables, zero policies here -----------
-- Under PostgREST this means a direct from('stones').select() returns []
-- for authenticated and anon. An empty array, not an error, which is
-- exactly how ten minutes gets spent thinking the query is broken. It
-- isn't. Reads go through the SECURITY DEFINER RPCs in 0004.
alter table public.profiles      enable row level security;
alter table public.spaces        enable row level security;
alter table public.space_members enable row level security;
alter table public.cairns        enable row level security;
alter table public.stones        enable row level security;
alter table public.pins          enable row level security;
alter table public.briefings     enable row level security;

-- Distance helper -----------------------------------------------------
-- Haversine, metres, spherical earth, ~0.5% error — far better than phone
-- GPS. No PostGIS, no cube/earthdistance, no geography column, no GIST
-- index: at tens of cairns a seq scan calling this is sub-millisecond, and
-- enabling an extension nothing else touches today costs twenty minutes.
--
-- ARGUMENT ORDER IS LAT FIRST, unlike GeoJSON. Swap a pair and every cairn
-- lands a few hundred km away and every distance check fails silently with
-- plausible-looking numbers. Sanity-check one known pair before trusting it.
--
-- Null in, null out — and `null <= radius_m` is null, not true, so a cairn
-- with a missing coordinate fails closed everywhere this is used.
create or replace function public.distance_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql
immutable
parallel safe
as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Not SECURITY DEFINER: it touches no table, so it needs no elevation and
-- no pinned search_path. Everyone may call it; it reveals nothing.
grant execute on function public.distance_m(double precision, double precision, double precision, double precision)
  to anon, authenticated, service_role;

-- PostgREST caches the schema. After any DDL it is stale, and you will
-- debug a function that is already correct.
notify pgrst, 'reload schema';

-- CHECK AFTER RUNNING THIS FILE ---------------------------------------
--   select public.distance_m(46.05, 14.51, 46.06, 14.51);  -- ~1112
--   -- seven tables in the Table Editor, each with the RLS badge on
--   -- insert into public.pins (stone_id, x, y) values (gen_random_uuid(), 640, 480);
--   --   must fail on the check constraint (it will also fail on the FK — that
--   --   is fine, the point is that it does not land)
