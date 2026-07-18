---
id: CRN-027
title: Seed the eleven-stone Space cairn
epic: E8 Demo
priority: P0
status: todo
owner: unassigned
estimate: 35m
slot: "12:30"
depends_on: [CRN-026]
blocks: [CRN-023, CRN-028]
---

# CRN-027 — Seed the eleven-stone Space cairn

**Fill the meeting-room cairn from `CRN-026` with eleven backdated stones from four fake accounts spanning three months, each carrying a pre-written transcript, so "Brief me" has something worth summarising.**

## Why this exists

The moment that wins the room is a phone talking to a silent room about three months of a place's history. That synthesis is only as good as the history underneath it. Eleven stones of lorem ipsum produce a summary of nothing, and everyone can hear it.

Transcripts are stored **directly** on the rows here rather than generated. That is deliberate: `CRN-023` reads stored transcripts, so live transcription (`CRN-022`, P1, 15:00) can fail entirely and the winning beat still works. This ticket is the reason that dependency edge does not exist.

Writing the eleven stones is the actual work of this ticket. Budget more time for the words than the SQL.

## Scope

**The Space.** Insert the Space row directly at 12:30 with the **service role** key — a hard-coded UUID literal, a fixed accent hex distinct from `#D9A441`, a fixed six-character join code, and a plausible facilities operator name, not a real company — together with the four `space_members` rows. This is the "hardcoded demo team" shape already described in [`reference/scope-and-risks.md`](../reference/scope-and-risks.md) § The pre-made cut. `CRN-018` is the user-facing path to the same row, **not** a prerequisite for this seed: it does not start until 14:00 and may never be built at all under `SCHEDULE.md` cut decision 1, and a P0 seed cannot wait on a P1 that might be cut. Re-point cairn 3 from `CRN-026` at this Space (`space_id`), give it a title naming the physical thing: e.g. *Meeting Room 3B — fan coil*.

**Four accounts.** Real `auth.users` rows with `profiles` rows and `display_name` set, all four added to `space_members`:

| Who | Role in the story |
|---|---|
| Marta Kern | Facilities tech. Owns the problem, then leaves. |
| Dario Vukaš | Takes the building over from Marta in June. |
| Ines Poljak | Office manager. Reports symptoms, not causes. |
| Tomaž Bregar | External HVAC contractor. In twice. |

**Eleven stones.** Backdated `created_at`, oldest 2026-04-21, newest 2026-07-14. Kinds mixed: 5 voice, 2 photo, 4 text. Every voice stone gets a `transcript`.

1. **2026-04-21 09:14 · Ines · text** — "Water on the table under the projector again after Friday's all-hands. Third time now. Cleaner says it's been happening since March."
2. **2026-04-21 16:02 · Marta · voice** — "I've been up in the ceiling above 3B. It's not the roof and it's not the sprinkler. It's the fan coil — condensate tray overflowing at the corner nearest the window. Tray's clean, no sludge. I've towelled it out and put a bucket in the void, which is not a fix, it's a bucket. Whoever picks this up: the drain line runs left toward the riser and I can't see where it goes past the beam."
3. **2026-04-22 11:30 · Marta · photo** — ceiling void, drain line disappearing behind the beam. Caption: "Bucket is at the low corner. Line goes left, behind this."
4. **2026-05-06 08:40 · Marta · text** — "Traced the drain. Four metres to the riser with almost no fall — under a centimetre over the whole run, and back-pitched near the beam. That's why it only overflows when the unit runs hard."
5. **2026-05-06 08:55 · Marta · voice** — "The pattern matches the booking calendar. Every overflow is the day after 3B is booked full for more than two hours in the afternoon. Twelve people, sun on the west glass, the unit runs flat out and makes more condensate than that pipe can carry away. Nobody noticed in winter because it barely runs."
6. **2026-05-19 14:20 · Bregar · voice** — "Bregar, Klima Servis. Looked at it with Marta. Proper fix is re-running the condensate drain with fall to the riser — that means opening the ceiling the length of the corridor, it's a weekend job. Short term I can fit a condensate pump on the tray, around three hundred euro, and it will hold. Both quoted. One thing: the unit is inside its five-year warranty on install workmanship until October. If the pitch was wrong at install, that's their bill, not yours."
7. **2026-05-21 10:05 · Marta · photo** — pump fitted, cable-tied to the tray. Caption: "Pump in, discharge tees into the riser at high level. Running."
8. **2026-06-02 09:12 · Ines · text** — "No water since the pump went in. But 3B hums now and people can hear it on calls. Two teams have moved their standup out of the room."
9. **2026-06-11 17:45 · Marta · voice** — *the handover.* "This is my last week, Dario's taking the building over. Three things on 3B that aren't in the system. The pump is a stopgap and it will fail — they always do — and when it fails the water comes back all at once instead of a drip. The real fix is the re-pitch and it's already quoted, Bregar, May, it's in the shared drive. And the warranty claim on the original install has not been filed. Somebody has to file it before October or we pay for the whole thing ourselves. I've told two people and neither of them wrote it down. So I'm saying it here, standing under the thing, so it stays with the room."
10. **2026-06-24 13:30 · Dario · voice** — "Dario, picked this up from Marta. Pump's running, tray's dry, I've put the pump on the quarterly check. Haven't touched the warranty — I don't have the install paperwork and I don't know who did the original fit-out."
11. **2026-07-14 08:20 · Dario · text** — "Stain is back on the tile at the window corner. Small, dry to touch. Pump still running, so either it's slow-cycling or there's a second leak path. Watching it. Warranty window closes in October and the claim still isn't filed."

The thread has to go somewhere: a **recurring** symptom with a cause nobody found for a month, a **handover** between two people, and an **unresolved** item with a deadline. Those three are what a summary can be judged against.

Keep the seed in a re-runnable file (`supabase/seed/space-cairn.sql`) with hard-coded UUID literals, deleted-then-inserted, so re-running after a wipe gives eleven stones and not twenty-two.

## Acceptance criteria

- [ ] Standing in the meeting room, the cairn opens and the thread shows exactly **11** stones, oldest at the bottom, from **4** distinct display names. No "unknown" authors.
- [ ] The rendered timestamps span 2026-04-21 to 2026-07-14 — roughly three months — and the newest reads as a few days ago, not three months ago.
- [ ] The thread contains at least one photo stone and at least one text stone visibly rendered as different stone types, not eleven identical rows.
- [ ] Every voice stone has a non-null `transcript` in the database: `select count(*) from stones where cairn_id = <id> and kind = 'voice' and (transcript is null or transcript = '')` returns 0.
- [ ] "Brief me" produces a summary that names, unprompted: the overflow is driven by heavy afternoon occupancy; the pump is a temporary fix; **the warranty claim is unfiled and expires in October**. If the October deadline does not survive the synthesis, the seed content is the problem, not the prompt.
- [ ] The cairn's glyph on the map is visibly taller than the single-stone cairn 1 from `CRN-026` — the stone-count height from `CRN-007` reading as terrain is half the point of stacking eleven.
- [ ] Standing 150m away, the network response for this cairn contains no transcript text and no audio URL. Grep the response body for the word "warranty" — zero hits.
- [ ] `select space_id from cairns where id = <cairn 3>` returns the seeded Space UUID, and `select count(*) from space_members where space_id = <space>` returns 4 including the demo account. (Whether a non-member sees nothing is `CRN-020`'s criterion, not this ticket's — it may be cut.)
- [ ] Re-running the seed file twice leaves 11 stones, not 22.

## Not in this ticket

Live transcription of newly recorded audio (`CRN-022`). The "Brief me" button, synthesis and TTS (`CRN-023`) — this ticket only guarantees it has input. The four coordinates and the other three cairns (`CRN-026`). The user-facing create-Space screen and the join-code flow (`CRN-018`) — this ticket writes its Space row directly and does not wait for that screen to exist. Scoped visibility enforcement (`CRN-020`) — this ticket consumes it. Photo pins on stones 3 and 7: nice if `CRN-014` has landed by then, but the pin showcase is cairn 2 in `CRN-026` and this cairn does not need them.

## Notes & traps

- **You cannot hand-insert into `auth.users`.** `profiles.id` references it. Create the four accounts properly — the dashboard's Add User button, or the admin create-user call with the **service role** key from a throwaway local script. Four throwaway emails, thirty seconds each. Do not go spelunking in the `auth` schema and do not drop the foreign key to save four minutes; you will spend twenty on the trigger that populates `profiles`.
- **Seed with the service role, from the SQL editor.** RLS will reject inserts where `author_id` is not the calling user, which is every one of these eleven. The Supabase SQL editor runs as a superuser role and bypasses RLS; a supabase-js client with the anon key does not. If you insist on scripting it, use the service role key and keep it out of git.
- **`created_at` must actually accept your value.** An explicit value overrides a `default now()`, but a `BEFORE INSERT` trigger that sets `created_at = now()` will silently stamp all eleven with today. After seeding, `select created_at from stones where cairn_id = <id> order by created_at` and confirm you get eleven different dates in 2026-04 through 2026-07. Do not confirm this by looking at the UI, which may be formatting something else.
- **Timezones.** Write `timestamptz` literals with an explicit offset or a trailing `Z`. Naive strings get interpreted in the session timezone and you get an hour of drift — harmless — or, if two stones are minutes apart, a thread that renders in the wrong order, which is not.
- **A voice stone with no audio looks broken on stage.** If the thread renders a play button for `kind = 'voice'` and `audio_url` is null, the judge sees a dead control. Either record real audio for the voice stones while you are in the meeting room for `CRN-026` — **stone 9, the handover, at minimum**, since it is the one you will actually tap — or confirm the thread renders a transcript-only voice stone gracefully. Decide this before you write the SQL, not on stage.
- **Upload audio through the app's own path.** If you do record the voice stones, put them in the bucket and key layout `CRN-003` defined and let the app produce the URL. Hand-written storage URLs work in the SQL editor and 400 on the device.
- **All four accounts need `space_members` rows.** Miss one and either their stones vanish under `CRN-020`'s visibility filter or their author name fails to resolve — and whichever it is, it will be Marta, who wrote six of the eleven.
- **Do not reuse one profile with four names.** Four `author_id` values, four `display_name` values. "Eleven stones from four people" is a line in the pitch and a judge can count avatars.
- **Write the words before you write the SQL.** Eleven plausible-but-flat entries produce a flat summary — the model cannot synthesise a thread that has no thread. The recurrence, the handover and the October deadline are load-bearing; if you rewrite the content, keep those three.
- Keep names invented. Do not use the venue's real facilities contractor, a real building, or a colleague's name on a fabricated maintenance record.
- Room number, Space name and accent hex have to match whatever `CRN-029` says out loud. Write the final values into `DEMO.md` when you are done.
