# Cairn — Design System

Look a value up here instead of re-deriving it. Every number in this file is a decision that has already been made.

Field journal, not social app. The restraint **is** the design.

---

## Palette

Five colors. There is no sixth. Secondary tones are `#E8E3D8` at reduced opacity, never a new hex.

| Role | Hex | Used for | Never used for |
|---|---|---|---|
| Base | `#0F1E17` | Every screen background, map base, sheet and card fill, text *on* amber | Text on base |
| Contour / primary type | `#E8E3D8` | Contour lines, all primary type, cairn glyph strokes, settled waveform stones | Anything that means "live" |
| Accent — amber | `#D9A441` | **Unlocked and live, only.** See below | Chrome. Buttons. Headers. Dividers. Focus rings. Branding |
| Alert — terracotta | `#C0563A` | Unresolved pins, unresolved-flag ring on a cairn glyph, destructive confirm | General errors, validation text, "recording" state |
| Space accent | per-Space, `spaces.accent_hex` | Space cairn glyph stroke, Space chip, Space wordmark | Proximity state — that stays amber |

### Where amber is not used

Amber is the only signal in the app that means *you are here and this is open to you*. It is the payoff of the entire distance mechanic. Spend it on a button and the payoff is gone.

Amber is permitted in exactly five places:

1. The `HERE` label replacing the distance number inside 30m.
2. The cairn glyph stroke when the user is inside that cairn's radius.
3. Playback progress on a waveform (played stones amber, upcoming contour at 40%).
4. Recording stones while the mic is live.
5. Photo pins (resolved ones — unresolved are terracotta).

Everything else is `#E8E3D8` at some opacity. Primary buttons are contour-on-base with a 1pt contour border, not amber fills.

### Opacity ladder

Apply to `#E8E3D8`. These six values are the whole secondary palette.

| Alpha | Use |
|---|---|
| 100% | Primary type, active glyph strokes |
| 60% | Body support, settled waveform stones, empty-state copy, Space wordmark |
| 40% | Metadata — author names, timestamps, distances, unplayed waveform |
| 20% | Map contour lines, skeleton loaders |
| 12% | Hairlines, dividers, card borders |
| 6% | Elevated surface fill over base (sheets, cards) |

---

## Type

**Face:** General Sans. Fallback Söhne, then system (`-apple-system` / SF Pro). Mono: SF Mono, fallback JetBrains Mono.

**Line height is 1.6 everywhere.** React Native `lineHeight` is absolute points, so use the computed column:

| Token | Size | lineHeight | Weight | Notes |
|---|---|---|---|---|
| `display` | 28pt | 45 | 500 | Screen title. One per screen |
| `body` | 17pt | 27 | 400 | Default |
| `small` | 13pt | 21 | 400 | Secondary lines inside a card |
| `mono` | 11pt | 18 | 400 | `letterSpacing: 1.1`, uppercase |

**Never more than two type sizes on a screen.** Pick one of `display`/`body`/`small` as your large and one as your small, and stop. `mono` does not count toward the two — it is a different register, not a size.

`mono` is for timestamps, distances, stone counts, join codes, author names. Nothing else. It is rendered at 40% opacity unless it is a join code (100%) or a `HERE` label (amber, 100%).

**Emphasis** is opacity or the mono face. Not bold, not italic, not color.

### Layout

| Value | Number |
|---|---|
| Screen horizontal gutter | 24pt |
| Card / sheet padding | 20pt |
| Vertical rhythm unit | 8pt — all vertical spacing is a multiple |
| Gap between stones in a thread | 24pt |
| Max text measure | 62 characters |
| Minimum tap target | 44 × 44pt |

Body text is left-aligned. Always. Nothing is centered except a single-line empty state.

### Corner radius

2pt (waveform stones) / 8pt (chips, buttons, thumbnails) / 16pt (bottom sheets, full cards). No other values.

---

## Distance mechanic — rendering spec

The gate is enforced on the server (see the working rules in `../README.md`). This section is only about how the *rendering* tracks the user's distance. The client never blurs data it should not have — it blurs a deliberately low-fidelity payload the server is willing to give anyone.

### Bands

| Band | Distance `d` | Client has | Renders |
|---|---|---|---|
| **Far** | `d > 200m` | position, stone count, kind | Glyph + distance number. Nothing else |
| **Approach** | `30m ≤ d ≤ 200m` | + coarse amplitude array (24 buckets), 16px-wide photo thumb | Blurred waveform, pixelated thumb, sharpening continuously |
| **At** | `d < 30m` | + `audio_url`, `transcript`, full `image_url`, pin notes | Full resolution, autoplay |

`cairns.radius_m` defaults to 30. Read it per cairn; do not hardcode 30 in the render path. The 200m outer edge is a constant.

### Interpolation

```
t = clamp((200 - d) / (200 - radius_m), 0, 1)
```

`t = 0` at 200m, `t = 1` at the unlock radius. Everything in the Approach band is a function of `t`:

| Property | At `t = 0` | At `t = 1` | Formula |
|---|---|---|---|
| Blur (expo-blur `intensity`, 0–100) | 90 | 0 | `round(90 * (1 - t))` |
| Waveform opacity | 0 | 1 | `clamp(t * 8.5, 0, 1)` — fades in over 200 → 180m |
| Photo sample width (px, upscaled to fit) | 16 | 320 | `round(16 + t * 304)` |
| Distance number opacity | 1 | 0.4 | `1 - 0.6 * t` |

The waveform opacity ramp exists so crossing 200m is a fade, not a pop. There must be no visible discontinuity at either band boundary — if you can see the moment you cross 200m or 30m as a jump, the mechanic reads as a state machine instead of as walking.

### Photo pixelation

Do not blur the real image. At capture time, upload a **16px-wide JPEG thumbnail** alongside the original. The Approach band renders that 16px file scaled up to the card width with `resizeMode: 'cover'` and nearest-neighbour-ish upscaling; the sample-width formula above is achieved by swapping to progressively larger pre-generated thumbs only if you have them, otherwise hold the 16px thumb and let blur carry the interpolation. The full `image_url` is absent from the payload until `d < radius_m`.

### GPS behaviour

- `expo-location` — `watchPositionAsync` with `Accuracy.High`. Do not use `BestForNavigation`; it drains battery and you are demoing on one phone.
- iOS horizontal accuracy is realistically ±5–15m outdoors and much worse indoors. **Hysteresis on the unlock boundary: unlock at `d ≤ radius_m`, re-lock only above `radius_m * 1.5` (45m default).** Without this the card flickers between locked and unlocked while the user stands still.
- Throttle `t` recomputation to 1Hz. Animate every `t`-driven property over **400ms ease-out** so GPS jitter reads as breathing, not stutter.
- Autoplay on entering the At band fires **once per cairn per app session**. Not once per entry.

### Distance formatting

Always mono, 11pt, uppercase, 40% opacity — except `HERE`.

| `d` | Renders |
|---|---|
| `< radius_m` | `HERE` in amber at 100% |
| `< 1000m` | `240 M` — no decimals |
| `≥ 1000m` | `1.2 KM` — one decimal |

---

## Stacked-stone waveform

Not a bar chart. A stack of stones that grows upward. Each syllable adds a stone.

### While recording (hold to speak)

One centered column that grows as you talk.

| Property | Value |
|---|---|
| Stone height | 5pt |
| Vertical gap | 3pt |
| Stone width | 18–34pt, keyed to sample amplitude |
| Corner radius | 2pt |
| Horizontal jitter | ±2pt random per stone, seeded and stable |
| Color | Amber `#D9A441` (the mic is live) |
| Add threshold | one stone per metering sample above −30 dBFS |
| Column cap | 40 stones — past 40, merge pairs and halve, so the column height stays fixed |

`expo-audio` (not `expo-av`, which is deprecated) drives this. Poll recorder metering on an interval; if metering is unavailable or noisy on device, fall back to adding a stone every 120ms while the mic is open. **The visual is load-bearing and the data behind it is not** — a plausible stack beats a stalled one. Do not spend more than 15 minutes on real metering.

Recording is capped at **60s**. At 55s, the column tints toward terracotta.

### As a preview on a stone card

A horizontal run of short stacks built from the server's 24-bucket amplitude array.

| Property | Value |
|---|---|
| Columns | 24 |
| Column width | 3pt |
| Column gap | 3pt |
| Stones per column | 1–6, from the bucket value |
| Stone height / gap | 4pt / 2pt |
| Settled color | `#E8E3D8` at 60% |
| Played color | Amber `#D9A441` |
| Unplayed color | `#E8E3D8` at 40% |

Playback progress recolors columns left to right. That is the only progress indicator — no bar, no scrubber, no elapsed/total pair.

---

## Cairn glyph

Stacked stones. Height encodes stone count so density reads as terrain from across the map.

| Stones | Glyph | Height |
|---|---|---|
| 1 | single pebble | 8pt |
| 2–3 | 2 stones | 14pt |
| 4–6 | 3 stones | 20pt |
| 7–11 | 4 stones | 26pt |
| 12+ | 5 stones | 32pt |

- Stone widths from base upward: 14, 12, 10, 9, 8pt. Max glyph width 14pt.
- Stroke 1.5pt. Fill `#0F1E17` at 100% so contour lines do not read through the glyph.
- **Anchor at bottom-center** on the coordinate. A cairn sits on its point; it is not centered over it.
- Fixed screen-space size. The glyph does **not** scale with map zoom.
- Tap target 44 × 44pt regardless of glyph height.

### Glyph color

| State | Stroke |
|---|---|
| Default (personal cairn) | `#E8E3D8` 100% |
| Space cairn | `spaces.accent_hex` |
| User inside `radius_m` | Amber `#D9A441` + 1pt amber ring at 24pt radius |
| Holds an unresolved pin | Terracotta `#C0563A` ring, 1pt, at 20pt radius |

Amber wins over Space accent. Proximity state outranks identity.

### Map base

Contour lines only — no roads, no labels, no POI, no terrain shading. `#E8E3D8` at 20% on `#0F1E17`. If the styled base is not ready, a flat `#0F1E17` background with glyphs on it is an acceptable demo surface; a default Mapbox street style is not.

---

## Photo pin view

Full-bleed photo. Pins are notes attached to a *point on the photo*, not to the photo.

| Element | Spec |
|---|---|
| Photo dim | `#0F1E17` overlay at 40% alpha (photo reads at 60%) |
| Pin | 24pt circle, amber `#D9A441` fill, 1pt `#0F1E17` ring |
| Pin — unresolved | Terracotta `#C0563A` fill, same geometry |
| Pin number | mono 11pt, `#0F1E17`, centered |
| Provisional pin (placed, not committed) | Same, 60% opacity |
| Note card | Bottom sheet, `#0F1E17`, 16pt top radius, 20pt padding, ~40% screen height |

### Torch reveal

Tapping a pin brightens the photo **around that pin only**.

- Radial gradient centered on the pin's rendered position.
- Inner radius 90pt: dim overlay alpha `0` (full brightness).
- Falloff to outer radius 200pt: dim overlay returns to `0.40`.
- Animate the reveal over **260ms ease-out**. Reverse on dismiss.
- Exactly one torch at a time. Tapping a second pin moves the torch; it does not add one.

### Pin coordinates

**Stored normalized 0–1. Never pixels.** `x` = 0 at the left edge of the image content, 1 at the right. `y` = 0 at the top. This is a hard rule from the plan, not a preference.

The trap: normalize against the **rendered image content rect**, not the container. With `resizeMode: 'contain'` the image is letterboxed and the container is larger than the image in one axis. Compute the content rect from the image's intrinsic aspect ratio versus the container's, subtract the letterbox offset from the touch point, then divide. Use the same function in both directions — one `toNormalized(touch, layout)` and one `toScreen(pin, layout)`, so a bug shows up as pins offset consistently rather than as pins that place correctly and render wrong.

Test on one photo shot in portrait and one in landscape before you call this done.

### Placing a pin

Tap anywhere on the photo → provisional pin appears at 60% → hold to record (or type) → commits at 100% and takes the next number. Numbers are assigned in creation order and never reused.

---

## Space theming

A Space sets `accent_hex` and a wordmark. This is what makes the B2B demo look like a product.

**The accent replaces contour color for identity, and nothing else:**

- Cairn glyph stroke on the map, for cairns in that Space.
- The Space chip in the Nearby list.
- The wordmark in the header — max height 20pt, rendered at 60% opacity.

**The accent never replaces amber.** Standing at a Space cairn still shows amber `HERE`, amber glyph, amber playback. Identity and proximity are two different signals and merging them destroys the one that matters.

Personal cairns (`space_id` null) use `#E8E3D8`. No accent, no chip.

**Contrast floor:** the accent must reach 4.5:1 against `#0F1E17`. If an org picks something dark, lighten it programmatically until it passes rather than rejecting the input — a rejected color in a demo is a bug on stage.

Space cairns are invisible to non-members. Not a locked marker — **nothing at all**. There is no "you don't have access" affordance to design, because it must not exist.

---

## Motion

Three durations. One easing: `ease-out`.

| Duration | Use |
|---|---|
| 200ms | State changes — press, sheet dismiss, color transitions |
| 260ms | Torch reveal |
| 400ms | Distance-driven interpolation (blur, opacity, sharpen) |

Nothing faster than 200ms, nothing slower than 400ms. No springs, no bounce, no stagger.

---

## Tokens

```ts
export const c = {
  base:        '#0F1E17',
  contour:     '#E8E3D8',
  amber:       '#D9A441',
  terracotta:  '#C0563A',
  // secondary = contour at alpha
  t60: 'rgba(232,227,216,0.60)',
  t40: 'rgba(232,227,216,0.40)',
  t20: 'rgba(232,227,216,0.20)',
  t12: 'rgba(232,227,216,0.12)',
  t06: 'rgba(232,227,216,0.06)',
} as const;

export const type = {
  display: { fontSize: 28, lineHeight: 45, fontWeight: '500' },
  body:    { fontSize: 17, lineHeight: 27 },
  small:   { fontSize: 13, lineHeight: 21 },
  mono:    { fontSize: 11, lineHeight: 18, letterSpacing: 1.1,
             textTransform: 'uppercase' },
} as const;

export const s = {
  gutter: 24, pad: 20, unit: 8, thread: 24, tap: 44,
  r: { stone: 2, chip: 8, sheet: 16 },
} as const;

export const prox = {
  outerM: 200, relockFactor: 1.5, sampleHz: 1,
  ms: { state: 200, torch: 260, distance: 400 },
} as const;
```

---

## Restraint rules

Read this before adding anything.

1. **No shadows.** Elevation is a 12% hairline plus a 6% surface fill. That is the only depth cue.
2. **No gradients** except the torch reveal and the distance blur. Both are mechanics, not decoration.
3. **No icon set.** The app has three glyphs: the cairn stack, the pin circle, the waveform stone. If you need a chevron, draw a 1pt line at 45°.
4. **No avatars.** An author is a display name in mono at 40%.
5. **No counts you didn't earn.** No likes, reactions, badges, unread dots, or "3 new" pills. The only number in the app is a distance, a stone count, or a pin index.
6. **No spinners.** Show a 20% skeleton in the shape of the thing that is loading, or show nothing.
7. **No illustrations.** Empty states are one sentence, contour at 60%, left-aligned in the gutter.
8. **Two type sizes per screen.** If you are reaching for a third, you are building a settings page inside a field tool.
9. **Seven interactive elements per screen, maximum.** If there are eight, one of them is not needed.
10. **Amber is a signal, not a color.** Any use outside the five listed above is a bug.

The test for any addition: *would this survive being read on a phone, one-handed, outdoors, in sunlight, by someone holding a drill?* If not, cut it.
