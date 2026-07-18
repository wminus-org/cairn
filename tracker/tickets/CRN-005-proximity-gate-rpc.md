---
id: CRN-005
title: Server-side proximity gate
epic: E0 Foundation
priority: P0
status: todo
owner: unassigned
estimate: 45m
slot: "11:00"
depends_on: [CRN-002, CRN-004]
blocks: [CRN-007, CRN-015, CRN-016, CRN-020, CRN-024]
---

# CRN-005 — Server-side proximity gate

**One line.** — Two server-side reads: one that hands any authenticated client cairn positions and stone counts with zero content, and one that releases audio, transcripts, images and pins only after the server itself has computed that the caller is inside `radius_m`.

## Why this exists

The plan names this as one of two rules that save an hour each, and it is the only claim in the pitch that a judge can falsify in ten seconds by opening a network inspector. If content ships to the phone and the client decides whether to show it, the product is a blur filter. Everything downstream — the map (CRN-007), the stone thread (CRN-016), the blur treatment (CRN-015), Brief me (CRN-023) — reads through these two functions, so they get built once, early, and correctly.

## Scope

**Distance: the `public.distance_m()` helper.** It is already created in [`reference/data-model.md`](../reference/data-model.md)'s one-paste migration (haversine, metres, `immutable`) and both RPCs call it: `where public.distance_m(c.lat, c.lng, p_lat, p_lng) <= c.radius_m`. **No PostGIS**, no `cube`/`earthdistance`, no generated geography column, no GIST index — the demo has tens of cairns, a seq scan calling `distance_m` is sub-millisecond, and enabling an extension you will otherwise never touch today costs twenty minutes and buys nothing.

**RPC 1 — `cairns_nearby(p_lat, p_lng, p_max_m default 5000)`**
Returns per cairn: `id`, `lat`, `lng`, `title`, `stone_count`, `distance_m` (server-computed, rounded), `accent_hex`, `space_id`. Nothing else. No stone rows, no URLs, no transcripts, not even stone kinds. Filters to cairns that are personal-and-mine or belong to a Space the caller is a member of.

**RPC 2 — `cairn_detail(p_cairn_id, p_lat, p_lng)`**
Recomputes distance from the caller-supplied position against the cairn's own row and branches into exactly three response shapes. `band` is derived server-side; the client never sends it.

| Caller distance | `band` | What the response contains |
|---|---|---|
| 500 m | `far` | `id, title, stone_count, distance_m: 503`. `stones` is an **empty array**. |
| 120 m | `approaching` | Same, plus one stub per stone: `id, kind, author_name, created_at, pin_count`. Nothing else. **No** `audio_url`, **no** `image_url`, **no** `transcript`, **no** pin note text, and **no** waveform, duration or thumbnail data — those columns do not exist. |
| 10 m | `unlocked` | Full stones: `transcript`, signed `audio_url`, signed `image_url`, `image_aspect_ratio`, and `pins` with normalized `x`/`y` (0–1), `note_text`, `transcript`, signed pin `audio_url`. |

**The 200 m → 30 m blur is a rendering treatment with no partial data behind it.** Nothing decrypts halfway, and the server sends no degraded derivative — there is no `peaks`, `duration_ms` or `thumb` column and nothing today produces one. The client (CRN-015) synthesises the sharpening stone stack deterministically from the stone `id` — **24 buckets**, matching [`reference/design-system.md`](../reference/design-system.md) — and maps distance to a blur radius on top of it. That is a rendering trick and it is the correct rendering trick: the server has exactly two trust states, withheld and released, and the in-between band exists so walking has something to sharpen, not so the client can be trusted with more.

**Signing.** Storage buckets are private. SQL cannot mint signed URLs, and letting the client call `createSignedUrl` itself defeats the gate — it would sign any path it can name. So `cairn_detail` returns object **paths**, and a thin Edge Function wraps it: forward the caller's JWT so `auth.uid()` is still the real user, call the RPC, then sign only the paths that came back in an `unlocked` response using the service-role key. The client calls the Edge Function, never the detail RPC directly.

**Lock the tables.** RLS enabled on `cairns`, `stones`, `pins`, `briefings` with **no** permissive `select` policy for `authenticated`. All reads go through these functions. Both functions are `security definer`, `set search_path = ''`, `revoke execute from public, anon`, `grant execute to authenticated`.

## Acceptance criteria

- [ ] With Charles/Proxyman or the Expo network inspector open, standing 500 m from a seeded cairn: the detail response body contains no `http`-scheme string and no transcript text. Search the raw body for `.m4a`, `.jpg`, and a known transcript word — zero hits.
- [ ] At the same 500 m, `cairns_nearby` still returns that cairn with a correct `stone_count` and a `distance_m` within ±25 m of what the phone's own reading says.
- [ ] Faked at 120 m (override the position argument): response `band` is `approaching`, every stone stub carries exactly `id, kind, author_name, created_at, pin_count` and no other key, and searching the raw body for `.m4a` and for a known transcript word still returns zero hits.
- [ ] At 10 m: `band` is `unlocked`, `audio_url` is a signed URL that plays, and pasting that same URL with its query string stripped returns 400/403 from Storage.
- [ ] Calling `cairn_detail` from `curl` with the anon key and a lat/lng at the cairn's exact coordinates but **no** valid user JWT returns an error, not content.
- [ ] A user who is not a member of the Space owning a Space cairn gets that cairn absent from `cairns_nearby` (not present-and-locked) and an error or empty result from detail, even with correct coordinates.
- [ ] `select * from stones limit 1` via the PostgREST client with a normal user JWT returns zero rows or an error — the tables are not directly readable.
- [ ] Sending `{"unlocked": true}` or a client-computed `distance_m` as extra JSON in the detail request changes nothing about the response.

## Not in this ticket

The blur/pixelation shader and its distance→radius curve (CRN-015). The synthetic 24-bucket stone stack itself — CRN-015 derives it client-side from the stone `id`; this ticket's job is to guarantee the `approaching` band ships no real audio, image or text to derive it from. The position hook and permission prompt (CRN-008). Transcription itself (CRN-022 fills `transcript`; this gate only reads it, and CRN-023 consumes it). Demo-mode position override — it feeds these functions the same way real GPS does, and needs no server change.

## Notes & traps

- **`distance_m` takes (lat1, lng1, lat2, lng2) — argument order is lat-first, unlike GeoJSON.** Swap a pair and every cairn lands a few hundred kilometres away; every distance check then fails silently with plausible-looking numbers. Sanity-check one known pair against a maps app before trusting anything.
- **`security definer` bypasses RLS entirely.** The Space-membership predicate is not inherited from a policy — you must write the `exists (select 1 from public.space_members ...)` join by hand inside both functions. Forgetting it in `cairns_nearby` leaks another company's cairn positions on the map, which is worse than leaking audio.
- **`search_path = ''` means every identifier needs a schema.** `public.cairns`, `public.stones`, `auth.uid()`. A missing prefix throws `relation does not exist` at call time, not at create time.
- **Check the bucket is actually private.** If the storage bucket is public, signed URLs still work, the demo looks fine, and the entire gate is theatre — the raw object path is enough to fetch the file. Verify by requesting an object path with no token and confirming a 400/403.
- **The signed-URL TTL is `3600` seconds, and this ticket owns that number.** CRN-003, CRN-016 and CRN-028 all reference it; if you change it, change it here and tell them. An hour survives the rehearsal-to-pitch gap CRN-028 warns about and a card left open on stage, and a scraped URL that dies in an hour is still not a durable bypass — the gate protects path *discovery*, not the object. Sign at request time and re-mint on screen focus. Do not cache signed URLs in a table; a stored URL is a permanent bypass.
- Supabase RPC arguments are passed by name from `supabase.rpc('cairns_nearby', { p_lat, p_lng })`. If the names don't match the SQL parameter names exactly you get `PGRST202 function not found`, which reads like the function doesn't exist. Also true after changing a signature — Postgres keeps the old overload and PostgREST can't disambiguate; `drop function` the old one explicitly.
- After any DDL, PostgREST's schema cache is stale. `notify pgrst, 'reload schema';` or touch the API settings in the dashboard, otherwise you debug a function that is already correct.
- **A client can lie about its coordinates.** Real defence needs device attestation and is out of scope — say so in one sentence if asked and move on. What matters is that no *flag* is trustable: the server derives `band` from the cairn's true row, so there is nothing in the request body a curious judge can flip.
- Return `distance_m` rounded to a whole metre. Float noise in the number under the glyph looks broken on a projector.
- Build and verify RPC 1 completely before starting RPC 2. RPC 1 unblocks the map (CRN-007) and the Nearby list, which are three of the four blocked tickets; do not let signing complexity hold them.
