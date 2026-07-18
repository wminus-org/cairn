---
id: CRN-023
title: "Brief me: spoken synthesis of a cairn"
epic: E6 Intelligence
priority: P0
status: todo
owner: unassigned
estimate: 45m
slot: "15:00"
depends_on: [CRN-016, CRN-027]
blocks: []
---

# CRN-023 — Brief me: spoken synthesis of a cairn

**One line.** — One button on a stacked cairn sends the ordered transcripts, authors, and dates to Claude, stores the result in `briefings`, and speaks roughly 25 seconds of synthesis out loud, hands-free.

## Why this exists

This is the moment that wins the room. Meeting room, eleven stones, four people, three months. One press. The phone talks and the room goes quiet. Everything else in the build is setup for these twenty-five seconds.

It is also the entire B2B argument compressed into one interaction: the institutional memory attached to a place, delivered to someone standing there with a drill in the other hand. Nobody has to read anything.

## Scope

- A **Brief me** button on the cairn detail / stone thread surface (CRN-016), visible when the cairn is unlocked and has ≥3 stones.
- An Edge Function `brief` that takes `cairn_id`, `lat` and `lng`, calls `public.distance_m()` against the cairn's own row and returns nothing unless `distance_m <= radius_m` — the same check `cairn_detail` makes, derived server-side from the cairn row, never from a client flag.
- The function reads stones for that cairn ordered `created_at asc`, joined to `profiles.display_name`, and builds the prompt from `transcript` (falling back to `body_text` for text stones). It reads **stored** transcripts — it does not transcribe anything.
- Cache: if a `briefings` row exists for the cairn and no stone has been added since `generated_at`, return the stored `summary_text` immediately without calling Claude.
- Playback: on-device text-to-speech via `expo-speech`. One press → speech starts. No second tap, no play control required to hear it.
- Amber (`#D9A441`) pulse or waveform on the button while speaking, so the phone visibly *is* the thing talking.
- The returned `summary_text` renders as small, low-contrast prose directly beneath the button, on screen before speech starts. Three sentences at ~60 words fits without scrolling. This exists as the stage fallback `DEMO.md` § Cairn 3 depends on — if speech stalls, the presenter reads the first two lines aloud — not as a reading surface.

## Acceptance criteria

- [ ] Pressing **Brief me** on the seeded eleven-stone Space cairn produces audible speech from the phone speaker with no further interaction.
- [ ] The spoken output is between **20 and 30 seconds**, measured with a stopwatch, three runs in a row.
- [ ] The spoken text names at least one contributor by name, references at least one date or time span, and states something unresolved.
- [ ] Second press on the same cairn: speech begins within 2 seconds, no new row appears in `briefings`, and the Edge Function log shows no outbound Anthropic call.
- [ ] Disable the transcription function from CRN-022 entirely (or delete it). **Brief me** still works on the demo cairn, because the seed data (CRN-027) wrote the transcripts.
- [ ] Standing 500m from the cairn, invoke the function directly with a valid session: the response contains no `summary_text` and no transcript fragments. Verified in the network inspector, not by reading the code.
- [ ] Phone set to silent / ring switch off: the briefing is still audible.
- [ ] Kill `Speech.speak` (comment it out) and press **Brief me**: the summary text is fully visible under the button without scrolling, so the presenter can read it aloud.
- [ ] Add a twelfth stone to the cairn, press **Brief me**: a fresh briefing is generated and it reflects the new stone.

## Not in this ticket

- **CRN-022.** This ticket reads `stones.transcript`; it does not care who wrote it. Live transcription failing costs polish, not the demo.
- Cloud TTS (ElevenLabs and similar) and populating `briefings.audio_url`. Device speech is instant, free, offline, and cannot be broken by venue wifi. Leave `audio_url` null.
- Briefing a Trail, a Space, or "everything nearby". One cairn, one button.
- A transcript reader — a scrollable view of the underlying stone transcripts, or the briefing typed out as a primary reading surface. The three-line `summary_text` under the button (see Scope) is deliberate and is the demo's fallback; anything larger than that is not. The briefing is spoken. If it competes for attention as text, people read instead of listening and the moment dies.
- Regenerating briefings in the background, or pre-warming every cairn on the route. Pre-warm the demo cairn once by hand before you walk on stage (see traps).

## Notes & traps

**Apple Foundation Models was researched and rejected for this ticket.** Apple's own Notification Summaries — the same shape of task — hallucinated badly enough in production that Apple pulled it from news apps. Cross-attributing eleven stones across four authors is exactly its weak edge, and there is no hard word-count control. Stay on Claude, and keep the cached briefing as the stage path. Reasoning: [`reference/on-device-ai.md`](../reference/on-device-ai.md).

**The dependency runs backwards from what you'd expect.** Brief me depends on *stored* transcripts, which the seed script (CRN-027) writes directly. It does **not** depend on CRN-022. If someone "helpfully" makes this await live transcription, the P0 moment inherits a P1 failure mode at 15:20. Say no.

**The proximity rule applies here with force.** A briefing is a synthesis of transcripts — it is exactly the content the gate exists to protect. `summary_text` must be returned only by a server-side path that has verified the caller's coordinates against the cairn's `radius_m`. Do not add a public `select` policy on `briefings` and filter in the app. A judge opening the network inspector on the briefing call is the single most likely place this product gets caught. Position is an argument; identity is `auth.uid()` from the forwarded JWT and is never a parameter.

**Constrain the length in the prompt, hard.** Spoken English runs ~150 words per minute, so 25 seconds is **about 60 words**. Instruct explicitly: *"Maximum 60 words. Three sentences at most."* Then enforce it client-side too — truncate at a sentence boundary past ~70 words before handing the string to TTS. An unbounded summary read aloud on stage is ninety seconds of a phone droning while the room's attention leaves. This is the single highest-risk failure in the ticket and it is a prompt problem, not a code problem.

**Prompt shape.** System message carries the role and constraints; the user message carries the data. Give it one line per stone in strict chronological order:

```
2026-04-02 — Marta Kovač (voice): the valve on the third riser is weeping again, second time this quarter
2026-04-11 — Tom Ellery (text): ordered the replacement seal, 3 week lead time
...
```

Ask for exactly three things, in this order: **what happened here**, **what is still unresolved**, **what the last person said**. Require plain spoken prose — no markdown, no bullet points, no preamble like "This cairn contains…", no meta-commentary. Names and dates should read the way a person would say them ("Marta, back in April"), not as ISO strings. If it keeps opening with a preamble, don't add more prose instructions — switch to `output_config.format` with a one-field JSON schema (`{ briefing: string }`) and read that field.

**Model and parameters.** `claude-opus-4-8`, `max_tokens: 300`. **Do not set `temperature`, `top_p`, or `top_k` — they are rejected with a 400 on this model.** People add `temperature: 0.7` by reflex; that is your lost hour. Omit the `thinking` parameter entirely: on Opus 4.8 that runs without thinking, which is what you want for a 60-word summary on a latency budget.

**The API key lives in the Edge Function.** `supabase secrets set ANTHROPIC_API_KEY=...`, read with `Deno.env.get`. Calling Anthropic from the React Native client ships your key inside the app bundle. Same Deno-not-Node rules as CRN-022 apply.

**Cache so the stage press is instant.** `briefings` per the plan is `cairn_id, generated_at, summary_text, audio_url` — add a primary key or unique index on `cairn_id` so you can upsert on conflict. Invalidate by comparing `generated_at` against `max(stones.created_at)` for the cairn; if a stone is newer, regenerate. Then, **before you walk on stage, press Brief me once on the demo cairn** so the row exists. A cold API call in front of judges is three to six seconds of a silent phone.

**TTS:** `import * as Speech from 'expo-speech'` → `Speech.speak(text, { onDone, onStopped })`, and `Speech.stop()` when the screen unmounts or the user navigates away. Otherwise the phone keeps talking over the next part of your pitch, which is funny exactly once. Slow the rate slightly from the default if the default sounds rushed — but re-time the 25 seconds after you change it, because rate changes the duration.

**The silent switch will eat your demo.** iOS routes speech through the audio session, and under the default category a phone with the ring switch flipped plays nothing — you will press the button, get silence, and have no idea why. Set the audio session to a playback mode that ignores the silent switch before speaking (the same `setAudioModeAsync`-style call you already need for `expo-audio` stone playback in E3), and test it with the physical switch flipped. Do this at 15:15, not at 16:25.

**Hands-free means hands-free.** One press starts audio. No confirmation dialog, no "generating…" modal you have to dismiss, no play button that appears afterwards. If the user has to touch the phone twice, the drill line in the pitch stops being true.
