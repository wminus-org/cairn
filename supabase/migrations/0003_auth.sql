-- =====================================================================
-- CAIRN — 0003_auth.sql
-- CRN-004. Profile-on-signup trigger, a backfill for users who already
-- exist, and the only two RLS policies a client needs on profiles.
--
-- NOT EXECUTED. Run after 0002_storage.sql. Safe to re-run.
--
-- Auth decision, settled: anonymous sign-in. supabase.auth.signInAnonymously().
-- Magic link means leaving the app, opening Mail, and a deep link back, on
-- venue wifi, mid-pitch. Zero-second cost is the requirement.
--
-- BEFORE THIS FILE IS OF ANY USE: Dashboard -> Authentication -> Sign In /
-- Providers -> enable anonymous sign-ins. It is OFF by default and without
-- it the client gets a flat 422 about a disabled provider.
-- =====================================================================

-- Profile on signup ---------------------------------------------------
-- Without this the first stone insert fails on the author_id foreign key
-- and it gets debugged at 11:50.
--
-- THIS TRIGGER IS THE HOUR. If this function raises for any reason —
-- missing column, unqualified identifier, insufficient privilege — the
-- SIGNUP ITSELF fails and the client sees an opaque
-- "500 Database error saving new user" that says nothing about a trigger.
-- Hence: security definer, pinned search_path, every identifier schema-
-- qualified anyway (so it is also correct under `search_path = ''`), and
-- `on conflict do nothing` so it can never raise on a re-fired insert.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    -- 'Walker' per reference/data-model.md. CRN-004's body says
    -- 'Field User'; the data model is the canonical shape, so 'Walker'
    -- wins. Change it in one place if the room prefers the other.
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 'Walker')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill ------------------------------------------------------------
-- Anyone who signed in before this file ran (or during a mid-morning
-- reset) has an auth.users row and no profile. One statement, idempotent.
insert into public.profiles (id, display_name)
select u.id,
       coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'), ''), 'Walker')
from auth.users u
on conflict (id) do nothing;

-- Profiles RLS --------------------------------------------------------
-- Two narrow policies, self only. A user may read and rename themselves;
-- that is the whole name-entry field in CRN-004.
--
-- There is deliberately NO policy letting a client read other people's
-- profiles. Author display names reach the thread through the gated RPC in
-- 0004, which is SECURITY DEFINER and does the profiles join server-side —
-- so a name only ships alongside content the caller has already earned.
-- A blanket `using (true)` here would hand every client the full roster of
-- every Space's members, which is a smaller leak than audio but a leak
-- with no upside.
drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

-- No `for insert` policy: the trigger above is SECURITY DEFINER and does
-- not need one, and a client has no legitimate reason to create a profile.
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles
  for update
  to authenticated
  using      (id = auth.uid())
  with check (id = auth.uid());

notify pgrst, 'reload schema';

-- DEMO / SEED ACCOUNTS — deliberately NOT in this file -----------------
-- profiles.id is a foreign key to auth.users(id). You cannot invent the
-- four fake authors demo cairn 3 needs by inserting four rows into
-- profiles; the FK rejects them. They must be created through the Auth
-- Admin API (auth.admin.createUser, service_role key, from a Node script
-- on the laptop), which fires the trigger above and produces real profile
-- rows — then `update public.profiles set display_name = ...`.
-- Capture the returned UUIDs into a checked-in constants file so CRN-027
-- is idempotent. Budget five minutes and discover this at 12:30, not 15:45.
-- The service-role key never goes near the app bundle.

-- CHECK AFTER RUNNING THIS FILE ---------------------------------------
--   Call signInAnonymously() once from the app, then:
--     select id, display_name from public.profiles order by created_at desc limit 1;
--   -> exactly one new row, non-null display_name, nobody inserted it by hand.
--   Force-quit and relaunch the app: same user.id. If it changes, the
--   client is missing AsyncStorage as auth.storage — supabase-js falls back
--   to in-memory silently, with no error.
