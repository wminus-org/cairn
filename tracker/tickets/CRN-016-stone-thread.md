---
id: CRN-016
title: Stone thread
epic: E4 Stacking
priority: P0
status: todo
owner: unassigned
estimate: 35m
slot: "14:30"
depends_on: [CRN-005, CRN-011]
blocks: [CRN-017, CRN-023]
---

# CRN-016 — Stone thread

**Opening a cairn shows its stones as a vertical thread — oldest at the bottom, newest at the top — each with author, mono timestamp, and its own renderer for voice, photo, or text.**

## Why this exists

A cairn is a conversation held at a coordinate over time, and the thread is the only surface where that reads. It is also the screen the demo spends the most seconds on: cairn 3 on the route is a Space cairn with eleven stones from four accounts spanning three months, and "Brief me" (CRN-023) is pressed from here. If the thread looks like a chat app, the metaphor dies; if it looks like a stack, the pitch writes itself.

## Scope

- Thread screen for a single cairn, entered from the map glyph or the Nearby list.
- Header: cairn title, stone count, current distance in mono, Space accent if the cairn belongs to a Space.
- Stones fetched through the proximity-gated read from CRN-005. The client sends its position; the server decides what comes back. No filtering in JS.
- Vertical order: newest stone at the top of the screen, oldest at the bottom. Stones stack upward, like the object.
- Each row: author `display_name`, mono 11pt letterspaced timestamp (absolute, e.g. `12 APR · 09:14` — the three-month spread must be visible), and a kind-specific body:
  - **voice** — the stone-stack waveform from CRN-011, tap to play inline, single player at a time.
  - **photo** — thumbnail with a pin count badge; tap opens the photo pin view (CRN-014).
  - **text** — the body text, no chrome.
- Proximity rendering per the E3 tiers: >200m the thread is not reachable (glyph + distance only); 200m→30m waveforms and thumbnails render blurred/pixelated and playback is disabled; <30m full resolution and the newest voice stone autoplays once on entry.
- Empty state for a cairn with zero stones: a single line, no illustration.

## Acceptance criteria

- [ ] Opening the eleven-stone demo cairn from inside 30m renders eleven rows, four distinct author names, timestamps spanning roughly three months, in one scroll.
- [ ] The bottom-most stone is the oldest by `created_at` and the top-most is the newest; verified against the row order in the Supabase table editor.
- [ ] Voice, photo, and text stones each render with their own body treatment in the same thread — screenshot the demo cairn and all three are visible.
- [ ] Tapping a voice stone plays it; tapping a second voice stone while the first is playing stops the first — no overlapping audio.
- [ ] Playback is audible with the iPhone hardware mute switch flipped to silent.
- [ ] Standing 150m from the cairn, waveforms render visibly blurred, no play control is active, and the network response for the thread fetch contains no `audio_url`, no `image_url`, and no `transcript` values — checked in the network inspector, not in the UI.
- [ ] Standing inside 30m, the same fetch returns those fields populated and the newest voice stone autoplays exactly once.
- [ ] Every row shows a non-empty author name. No row reads `null`, `undefined`, or a raw UUID.
- [ ] Tapping a photo stone opens CRN-014 with that stone's pins already loaded.

## Not in this ticket

- Adding a stone to the thread — that is CRN-017.
- "Brief me" and the briefing playback — CRN-023.
- The photo pin viewer itself — CRN-014.
- Editing or deleting stones. Not shipping today, not stubbed.
- Reactions, read receipts, unread counts, pagination.

## Notes & traps

- **The gate is CRN-005's, not yours.** Call the proximity RPC and render what it hands back. Do not fetch the `stones` table directly and hide fields in the component — a judge with the network inspector open ends the demo. If a field comes back `null`, that is the server saying "not close enough," and the UI should render the locked state from that, not from a distance the client computed.
- **Author names come from `profiles`, and RLS will silently eat them.** A join to `profiles` returns nothing for rows the caller cannot select, and PostgREST reports that as `null` rather than an error, so the thread renders eleven anonymous stones and nobody notices until the demo. Either return `display_name` from inside the same `SECURITY DEFINER` function as the stones, or add an explicit select policy on `profiles`. Verify with a second account, not just your own.
- **Order once, in SQL, and pick one rendering strategy.** Newest-at-top means either `order by created_at desc` into a normal list, or `asc` into a `FlatList` with `inverted`. `inverted` applies a transform to the whole list, which flips shadows, breaks some blur overlays, and reverses scroll-to-index. On a six-hour build, take the `desc` + plain `ScrollView` route — eleven rows do not need virtualization.
- **expo-audio, not expo-av.** `expo-av` is deprecated; do not copy a Stack Overflow answer that uses `Audio.Sound`. Keep exactly one active player instance for the whole thread and stop it before starting another, or two stones talk over each other on stage.
- **iOS silent switch.** By default audio does not play through the earpiece route when the hardware mute switch is on. Set the audio mode at app start so playback ignores the silent switch (the "plays in silent mode" flag in expo-audio's audio-mode API) and unset "allows recording" during playback — leaving the session in record mode routes output to the earpiece at low volume and it will sound broken in a room.
- **Signed Storage URLs expire.** If CRN-005 returns signed URLs, use a TTL that survives the whole rehearsal block, and re-fetch the thread on screen focus. A thread opened at 15:40 and demoed at 16:20 will otherwise 403 on play with no visible error.
- **Autoplay fires on focus, not on mount.** Navigating back from CRN-014 re-focuses the screen; guard the autoplay with a ref so returning from the photo viewer does not restart the newest stone mid-pitch.
- **Timestamps are absolute.** "3 months ago" collapses the exact thing the demo is selling. Mono, 11pt, letterspaced, `#E8E3D8` at reduced opacity — never the amber, which is reserved for unlocked/live state.
