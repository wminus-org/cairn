---
id: CRN-015
title: Distance-gated blur and sharpen
epic: E3 Proximity
priority: P0
status: todo
owner: unassigned
estimate: 45m
slot: "14:30"
depends_on: [CRN-005, CRN-007, CRN-008]
blocks: []
---

# CRN-015 — Distance-gated blur and sharpen

**One line.** — Render the proximity gate: beyond 200m a glyph and a number, 200m→`radius_m` a continuous blur that sharpens as you walk, inside `radius_m` full resolution and autoplay.

## Why this exists

This is the mechanic that makes Cairn read as an object instead of a feed. A hard on/off geofence is a permission check; a preview that visibly resolves as you close the distance is a product. Walking is the loading bar — the plan's words, and the reason there is no spinner anywhere in this ticket.

It is also the visible proof of the server gate. CRN-005 already withholds audio URLs and transcripts from a client that has not proven proximity. This ticket makes that withholding legible on screen instead of invisible.

## Scope

Distance → progress, one function, used everywhere:

```
d  = distance_m from the CRN-005 response   // server's number, whole metres
r  = radius_m  from the CRN-005 response    // per cairn, default 30
p  = clamp((200 - d) / (200 - r), 0, 1)     // 0.0 at 200m, 1.0 at r
```

**`r` is read per cairn. Do not hardcode 30 anywhere in the render path** — `reference/design-system.md` forbids it and the seed breaks it: `reference/data-model.md` overrides `radius_m` to 60–80 for the indoor cairns (corridor, meeting room, stage), so on demo cairns 2, 3 and 4 the server returns `unlocked` well outside 30m. A render path with 30 baked in draws a blurred, locked card over an unlocked payload.

**There are two distances and they have different jobs.**

- **The server's `distance_m` is the distance.** It is what the number on screen reads and it is what selects the band. It arrives with every CRN-005 response, rounded to a whole metre. Do not recompute it for display — CRN-024 requires the Nearby list and the map glyph to agree on a cairn's distance to within 1m, and two independent computations will not.
- **A local haversine against the CRN-008 position is permitted for one thing only:** interpolating `p` smoothly between server responses, so the blur breathes with the walk instead of stepping once per RPC round-trip. It feeds the blur value. It never feeds the displayed number and it never selects a band.

Tier 1 of the payload carries both `distance_m` and `radius_m` (`reference/data-model.md`), so this costs nothing — the position hook already triggers the RPC call.

Three bands, driven off `d` and `p`:

- **d > 200m — sealed.** The stacked-stone glyph from CRN-007 and a distance number in mono 11pt letterspaced, `#E8E3D8`. Nothing else renders: no waveform, no thumbnail, no play control, no stone count preview beyond the glyph height.
- **200m ≥ d > r — resolving.** The waveform preview draws but blurred; photo thumbnails render coarse. Both sharpen continuously with `p`. Distance number stays on screen.
- **d ≤ r — open.** Full-resolution image, sharp waveform, autoplay once, accent flips to amber `#D9A441`.

Two rendering techniques:

- **Blur (waveform, and the cheap path for images):** `BlurView` from `expo-blur` as an absolutely-positioned sibling over the content, `tint="dark"`, `intensity = round(90 * (1 - p))` quantized to steps of 5. 90 is the ceiling from `reference/design-system.md`, not 100.
- **Pixelation (images, the convincing path):** drive the *source resolution* from `p`. Pick a thumbnail width from a small bucket ladder (16 / 32 / 64 / 128 / 320 px) and let the `Image` upscale it to the card. Crossing a bucket boundary is the visible step; the blur layer smooths between buckets.

Distance in this ticket is for **rendering only**. It selects which of the assets the server already returned gets drawn and how badly it is degraded. It never decides what to fetch, never unlocks a control, and never appears in a request as a claim of proximity. The server's `band` is the authority on what the payload contains; `d` and `r` only decide how it looks.

## Acceptance criteria

- [ ] With position overridden to 400m from a seeded cairn, the card shows the stone glyph and the string `400 m` in mono and nothing else — no waveform, no thumbnail, no play button anywhere on screen.
- [ ] At 150m, the waveform is visibly blurred and the photo thumbnail is visibly coarse, and the network response that populated that card contains no `audio_url` and no `transcript` key. Check it in the inspector, not by reading the code.
- [ ] Stepping the override from 200m down to `radius_m + 10m` in 10m increments produces monotonic sharpening — no step renders blurrier than the step before it.
- [ ] At `radius_m - 1` (29m on a default cairn) the image is full resolution, the waveform is sharp, audio autoplays exactly once, and the accent is `#D9A441`.
- [ ] On a cairn seeded with `radius_m = 60` — one of the indoor demo cairns — the card is fully open at 55m: full-resolution image, sharp waveform, amber accent. Not a blurred card. The same override at 55m against a default 30m cairn still renders blurred. One build, two cairns, two different answers.
- [ ] The distance number rendered on the card is byte-identical to the `distance_m` in the response that populated it — read both, don't eyeball. This is what makes CRN-024's "map and Nearby agree to within 1m" criterion reachable.
- [ ] Hard-coding the client distance to 5m while physically 150m from the cairn still returns no audio URL and no transcript. The card renders sharp and empty. This is the judge-with-a-network-inspector test.
- [ ] Crossing `radius_m` outward to `radius_m * 1.4` and back repeatedly — 30m → 42m → 30m on a default cairn, inside the re-lock threshold — does not restart playback and does not re-blur a card that has already opened.
- [ ] Map with ~8 cairns visible in the resolving band scrolls without dropped frames on the demo device.

## Not in this ticket

- The server-side gate itself and the shape of what it returns per band — CRN-005.
- Position acquisition, permissions, and the watcher — CRN-008.
- Glyph geometry and stone-count height encoding — CRN-007.
- Recording, playback transport, and the stone thread UI.
- The demo-mode fixed-route position override (E7). Consume it if it exists; do not build it here.

## Notes & traps

- **`BlurView` blurs what is behind it, not its children.** It must be a sibling laid over the content inside the same parent — `StyleSheet.absoluteFill`, `pointerEvents="none"` — not a wrapper around it. Wrapping it produces a component that looks like it does nothing and costs twenty minutes.
- **Do not animate `intensity` at 60fps.** Update it only when the position hook emits, quantized to steps of 5. Driving a native iOS `UIVisualEffectView` from a per-frame JS value stutters and looks worse than stepping. `experimentalBlurMethod` is Android-only; ignore it, Android is out of scope.
- **One heavy blur on screen at a time.** `UIVisualEffectView` is expensive. The expanded cairn card gets a `BlurView`; map glyphs never do. If you need degradation on the map itself, use opacity and glyph size, not blur.
- **There is no nearest-neighbour flag** on React Native `Image` or `expo-image`. Do not go looking for one. You get crunchy pixels by making the source genuinely small and letting it scale up — that is why the bucket ladder exists.
- **Supabase Storage image transformations** (`transform: { width, ... }` passed to `getPublicUrl` / `createSignedUrl`) are a paid-plan feature on hosted projects. On free tier this fails at request time and every thumbnail is blank. Confirm it works with one URL before building on it. Fallback that always works: generate a ~32px thumb at upload with `expo-image-manipulator`, store it as a separate `thumb_url`, and have CRN-005 return `thumb_url` in the resolving band and `image_url` only inside `radius_m`.
- **GPS jitters ±10–20m near buildings**, which will flap the unlock boundary and restart autoplay in a loop during the pitch. Unlock at `d ≤ radius_m`, re-lock only above `radius_m * 1.5` (45m on a default cairn, per `reference/design-system.md`), and latch: once a cairn has opened in this session it stays open. Note that the hysteresis band scales with the cairn — a 60m indoor cairn re-locks at 90m, which is the point.
- **`expo-location`:** use `watchPositionAsync` with a `distanceInterval` rather than a tight `timeInterval`, and `Accuracy.High` rather than `BestForNavigation`. Highest accuracy is not more accurate outdoors and a demo phone at 20% battery is a real failure mode.
- **The local haversine and the server's `distance_m` will disagree** by a few metres — the server sampled a position at request time, the local one is recomputed every position tick. That is fine, which is exactly why the local number is confined to smoothing the blur and never reaches the screen. The moment you render it, the map and the Nearby list start showing different numbers for the same cairn on a mirrored display, which is the failure CRN-024 is written to prevent.
- **Never render an unlocked state over a locked payload.** The server's `band` wins over your arithmetic. If the card looks sharp but the response carried no audio, show the sealed state, not a broken player — that mismatch means `radius_m` got hardcoded somewhere.
- **Test with the override, not with your legs.** Build a hidden dev slider for `d` before you build anything else in this ticket. Five minutes, saves thirty, and it is the only way to check the monotonic-sharpening criterion.
