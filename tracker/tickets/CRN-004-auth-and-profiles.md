---
id: CRN-004
title: Auth and profiles
epic: E0 Foundation
priority: P0
status: todo
owner: unassigned
estimate: 25m
slot: "10:30"
depends_on: [CRN-002]
blocks: [CRN-005, CRN-018]
---

# CRN-004 — Auth and profiles

**One line.** — Anonymous Supabase sign-in on first launch, a `profiles` row created by trigger, and a session that survives app restarts so no login screen ever appears on stage.

## Why this exists

Every server-side call downstream needs `auth.uid()`: the proximity gate (CRN-005) filters Space cairns by membership, stones need an `author_id`, and the stone thread renders an author name. Auth is a dependency, not a feature — the demo should never see it. A login screen mid-pitch is thirty dead seconds and a chance to fail live.

## Scope

**Decision: anonymous sign-in.** `supabase.auth.signInAnonymously()`. Magic link is rejected — it requires leaving the app, opening Mail, and a deep link back, on venue wifi. Zero-second cost is the requirement and anonymous is the only option that meets it.

1. Supabase client configured for React Native with persistent storage (`@react-native-async-storage/async-storage`), `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: false`.
2. Bootstrap on app launch: `getSession()`; if null, `signInAnonymously()`. Render nothing but a splash until a session exists — no login UI in the tree at all.
3. `handle_new_user()` trigger on `auth.users` insert → inserts `public.profiles (id, display_name)`. `display_name` from `raw_user_meta_data->>'display_name'`, falling back to a constant like `'Field User'`.
4. A one-field name entry reachable from the map (not blocking) that writes `profiles.display_name`. Two minutes of work, and it makes the stone thread read like people instead of UUIDs.
5. A seed script (laptop-only, service-role key) that creates the four demo accounts CRN-027 needs, with fixed emails, and writes their UUIDs into a checked-in constants file so seeding is idempotent and re-runnable.

## Acceptance criteria

- [ ] Fresh install on device: app reaches the map with no tap on any auth control, and a debug readout shows a non-empty `user.id`.
- [ ] Force-quit the app from the app switcher and relaunch: the debug readout shows **the same** `user.id`, and no splash-to-login transition is visible.
- [ ] `select id, display_name from profiles where id = '<that uid>'` returns exactly one row with a non-null `display_name`, without anyone having inserted it by hand.
- [ ] Setting a name in the app then relaunching shows the new name in the stone thread author slot.
- [ ] After running the seed script, `select display_name from profiles order by created_at` includes the four demo account names, and running the script a second time does not create duplicates or error.
- [ ] `grep` of the app bundle source for the service-role key returns nothing.

## Not in this ticket

Row-level security policies on `cairns`/`stones`/`pins` (CRN-005 owns the read path and its lockdown). Space membership rows (CRN-018). Avatar upload. Any account linking, email capture, or upgrade-from-anonymous flow. Sign-out — there is no reason for a sign-out button to exist today, and a stray one on demo day is a live grenade.

## Notes & traps

- **Anonymous sign-in is off by default.** Supabase Dashboard → Authentication → Sign In / Providers → enable anonymous sign-ins. Without it you get a flat 422 and a message about the provider being disabled. Turn it on before you write a line of client code.
- **The trigger is the hour.** A `handle_new_user` function that errors — missing column, wrong schema qualification, insufficient privilege — makes the *signup itself* fail, and the client sees an opaque `500 Database error saving new user` that says nothing about your trigger. Declare it `security definer`, `set search_path = ''`, fully qualify `public.profiles`, and test it by calling `signInAnonymously()` once before building anything on top.
- **Anonymous users still carry the `authenticated` role.** Policies written for `authenticated` will let them through, which is what we want. Watch for any policy or template that checks `(auth.jwt() ->> 'is_anonymous')::boolean is false` — that will lock out every real demo user.
- **No AsyncStorage means no persistence, silently.** supabase-js falls back to in-memory storage and the session vanishes on relaunch with no error. Install `@react-native-async-storage/async-storage` and pass it as `auth.storage`. Verify with the force-quit test above, not by reading the config.
- `detectSessionInUrl` must be `false` on React Native; the web default assumes a browser URL and will throw.
- **Do not call `signInAnonymously()` unconditionally on mount.** Every render-loop or hot-reload cycle mints a fresh anonymous user, orphaning the stones you just recorded. Gate it behind a `getSession()` check and a ref.
- **Seed accounts need real `auth.users` rows.** `profiles.id` references `auth.users(id)`, so you cannot fake the four demo authors by inserting profiles directly — the FK will reject it. Create them with the admin API using the service-role key from a Node script on the laptop, capture the returned UUIDs, and hardcode them for CRN-027.
- Add an `AppState` listener that starts/stops token auto-refresh on foreground/background. Skipping it means a phone that sat locked through lunch wakes with an expired token and every RPC returns 401 at 15:45.
- Keep the debug `user.id` readout behind a flag or in a corner at 10% opacity. You need it to check these criteria; you do not want it mirrored to a projector.
