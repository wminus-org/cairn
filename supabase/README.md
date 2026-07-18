# Supabase — apply order

**None of this SQL has been executed.** It was written on a machine with no Postgres and no Docker. It is correct by construction, not verified. Run it in the Supabase SQL editor as the project owner, one file at a time, **in order**, and check after each. All four files are safe to re-run.

| # | File | Ticket | What it does |
|---|---|---|---|
| 1 | `migrations/0001_schema.sql` | CRN-002 | Seven tables, indexes, RLS **on with zero policies**, `distance_m()` |
| 2 | `migrations/0002_storage.sql` | CRN-003 | Two private buckets, `storage.objects` policies |
| 3 | `migrations/0003_auth.sql` | CRN-004 | `handle_new_user` trigger, backfill, profiles self-policies |
| 4 | `migrations/0004_proximity_gate.sql` | CRN-005 / CRN-020 / CRN-017 | The two read RPCs, write policies, `stack_stone` |

Do steps 1–3 at 10:30. Step 4 can follow at 11:00; nothing before it needs it.

---

## Before you paste anything

Dashboard → **Authentication → Sign In / Providers → enable anonymous sign-ins.** It is off by default. Without it `signInAnonymously()` returns a flat 422 about a disabled provider and 0003 has nothing to trigger on.

---

## 1. `0001_schema.sql`

Check:

```sql
select public.distance_m(46.05, 14.51, 46.06, 14.51);   -- ~1112
```

- Table Editor shows all seven tables, each with the **RLS badge enabled**.
- From the app with the anon key, `select * from cairns` returns **zero rows and no error**. That is default deny working. Do not "fix" it.

## 2. `0002_storage.sql`

```sql
select id, public from storage.buckets where id like 'cairn-%';
```

Both rows must show `public = false`. **Look at it, don't assume it** — and if anyone ticks the public toggle in the dashboard later, re-running this file un-ticks it.

Then, from the client: `getPublicUrl(path)` pasted in a browser must return an error, and `.download(path)` must fail on permissions. With the service key, `createSignedUrl(path, 60)` must stream and then 400 after a minute.

On the very first real upload, check the **byte size** in the dashboard. A 0-byte or 44-byte object is the classic React Native upload failure and it passes every other check.

## 3. `0003_auth.sql`

Call `signInAnonymously()` once from the app, then:

```sql
select id, display_name from public.profiles order by created_at desc limit 1;
```

One new row, non-null `display_name`, and nobody inserted it by hand. If signup itself fails with `500 Database error saving new user`, that is this trigger, not the client.

Force-quit and relaunch: same `user.id`. If it changes, the client is missing AsyncStorage as `auth.storage` — supabase-js falls back to in-memory silently, with no error.

## 4. `0004_proximity_gate.sql`

```sql
select * from public.cairns_nearby(46.05, 14.51);
select public.cairn_detail('<cairn-id>', 46.05, 14.51);
```

Then the four things a judge could actually check:

1. At 500 m — `band` is `far`, `stones` is `[]`. Grep the **raw HTTP body** for `.m4a`, `.jpg`, and a known transcript word: zero hits.
2. At 120 m — `band` is `approaching`, each stone stub has exactly `id, kind, author_name, created_at, pin_count`. Still zero hits on the same greps.
3. Adding `{"unlocked": true}` or a client-computed `distance_m` to the request body changes nothing.
4. `select * from stones limit 1` through PostgREST with a normal user JWT returns zero rows. The tables are not directly readable.

And the CRN-020 case, tested as **a different logged-in user, not by logging out** (logged-out fails for boring reasons and gives a false pass): a non-member of a Space gets that cairn *absent* from `cairns_nearby`, and `cairn_detail` raises `cairn not found`.

---

## Things that will cost you fifteen minutes each

- **PostgREST schema cache.** After any DDL it is stale and you will debug a function that is already correct. Each file ends with `notify pgrst, 'reload schema';`, but if you hand-edit anything, run it again or touch the API settings.
- **RPC arguments are passed by name.** `supabase.rpc('cairns_nearby', { p_lat, p_lng })`. A name mismatch gives `PGRST202`, which reads like the function does not exist.
- **Changing a function signature** leaves the old overload behind and PostgREST cannot disambiguate. `drop function` the old one explicitly — 0004 already does this for its own functions.
- **`.insert(row).select()` fails** on `stones`/`pins`/`cairns`. The `.select()` needs a select policy that deliberately does not exist. Insert without `.select()` and generate the id client-side with `crypto.randomUUID()`.
- **`service_role` bypasses all of this.** That is how seeding (CRN-026/027) and signed-URL minting work. It must never reach the app bundle. Anon key in the client, service key in Edge Function secrets and the laptop seed script only.

## Where signing happens, and why it matters

`cairn_detail` returns storage object **paths**, named `audio_path` / `image_path` so nobody feeds one to an audio player by accident, and only in the `unlocked` band. A thin Edge Function forwards the caller's JWT (so `auth.uid()` is still the real user), calls the RPC, and signs only the paths that came back — 3600 s TTL, a number CRN-005 owns. The client calls the Edge Function, never the detail RPC directly, and never Storage directly.

If the buckets were public, none of this would mean anything: the key layout is derivable from cairn and stone ids, every client legitimately holds cairn ids, and the gate would be protecting the discovery of a path that anyone can guess. Private buckets are the other half of the gate, not a precaution.
