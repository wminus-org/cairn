# Supabase setup — click by click

Ten minutes. Do it once, carefully. Everything else in the build is blocked on this.

You will end up with a project URL and an anon key that go into `.env`. **The service_role key is not needed and must not go in `.env`** — it bypasses RLS and `EXPO_PUBLIC_*` variables are inlined into the app bundle.

---

## 1. Create the project

1. Go to **https://supabase.com/dashboard** and sign in.
2. **New project.**
3. **Name:** `cairn`.
4. **Database password:** generate one and save it somewhere you can find in ten minutes. You will not need it today, but you cannot retrieve it later.
5. **Region:** pick **Central EU (Frankfurt)**. You are in Ljubljana; every RPC on the demo route pays this latency, and the proximity gate is called on a walk.
6. **Create new project**, then wait ~2 minutes for provisioning. The SQL editor will not work until the status stops saying "Setting up".

## 2. Enable anonymous sign-ins — do this before anything else

**This is off by default and nothing works without it.** The app calls `signInAnonymously()` on launch; if this toggle is off you get a flat `422` with no useful message, usually at the worst possible moment.

1. Left sidebar → **Authentication**.
2. **Sign In / Providers** (older dashboards: **Providers**).
3. Find **Anonymous Sign-Ins**. Toggle it **on**. Save.

Anonymous is deliberate — a magic link means leaving the app, opening Mail, and deep-linking back, on stage, on venue wifi. See the reasoning at the top of `0003_auth.sql`.

## 3. Apply the four migrations, in order

Left sidebar → **SQL Editor** → **New query**. For each file below: paste the whole file, hit **Run**, then run the check and confirm you get what it says.

Run them **in order**. Each depends on the one before.

### `migrations/0001_schema.sql`

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by 1;
```
Expect **7 rows**: briefings, cairns, pins, profiles, space_members, spaces, stones.

Then confirm RLS is on everywhere — this is the whole security model:

```sql
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1;
```
Every row must show `relrowsecurity = true`. If any is false, stop and re-run 0001.

### `migrations/0002_storage.sql`

```sql
select id, public from storage.buckets where id like 'cairn-%';
```
Expect **2 rows**, `cairn-audio` and `cairn-images`, both with **`public = false`**.

If either says `true`, stop. A public bucket hands out permanent URLs and defeats the proximity gate entirely — the one thing a judge is most likely to check.

### `migrations/0003_auth.sql`

```sql
select tgname from pg_trigger where tgname = 'on_auth_user_created';
```
Expect **1 row**. This trigger creates a `profiles` row on signup; if it is missing, every new user is nameless in the stone thread.

### `migrations/0004_proximity_gate.sql`

```sql
select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('cairns_nearby','cairn_detail','stack_stone','distance_m')
order by 1;
```
Expect **4 rows**.

## 4. Smoke test the gate

Still in the SQL editor. This proves distance actually works before you trust it on a walk:

```sql
-- 0.01 degrees of latitude is ~1111.95 m anywhere on earth.
select round(public.distance_m(46.05, 14.47, 46.06, 14.47)::numeric, 2) as should_be_1111_95;
```

If that returns anything other than ~1111.95, the haversine is wrong and nothing downstream can be trusted.

## 5. Get the two values the app needs

1. Left sidebar → **Project Settings** (gear) → **API**. Newer dashboards call this **API Keys**.
2. Copy **Project URL** — looks like `https://abcdefghijklmnop.supabase.co`.
3. Copy the **anon** / **public** / **publishable** key — the long one starting `eyJ...`. **Not** `service_role`.

Then, in the repo root:

```bash
cp .env.example .env
```

and fill in:

```
EXPO_PUBLIC_SUPABASE_URL=https://<yours>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

`.env` is gitignored. Leave it that way.

The anon key being public is fine and by design: every table is default-deny under RLS, and all reads go through security-definer RPCs. That is exactly what `supabase/tests/` verifies.

---

## Done when

- [ ] Anonymous sign-ins toggled **on**
- [ ] All four migrations applied, in order, each check passing
- [ ] Both buckets exist and are **private**
- [ ] `distance_m` returns ~1111.95
- [ ] `.env` has the URL and anon key, and is not committed

## If something goes wrong

| Symptom | Cause |
|---|---|
| `422` on launch, no detail | Anonymous sign-ins still off. Step 2. |
| `500 Database error saving new user` | The `handle_new_user` trigger raised. Re-run 0003 and re-check step 3. |
| `permission denied for table stones` **from the app** | Expected and correct — clients never read tables directly, only RPCs. If a *feature* hits this, it is calling the table instead of `cairnApi.ts`. |
| `function public.cairns_nearby does not exist` | 0004 did not apply, or PostgREST's schema cache is stale. Re-run 0004; the cache reloads within seconds. |
| Audio does not play | Expected right now. The signing Edge Function is not built yet — see the note in `tests/README.md`. |
