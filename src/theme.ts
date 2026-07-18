import type { TextStyle } from 'react-native';

/**
 * Cairn design tokens.
 *
 * Canonical source: tracker/reference/design-system.md. Every number here is a
 * decision already made there — look it up, do not re-derive it.
 *
 * Field journal, not social app — the restraint is the design.
 *
 * NOTHING IS EVER REMOVED FROM THIS FILE. Three surfaces import from it
 * concurrently, so tokens are added and old names kept as aliases.
 */

export const palette = {
  /** Base. The deep green everything sits on. */
  base: '#0F1E17',
  /** Contour lines and primary type. Bone white. */
  bone: '#E8E3D8',
  /** Accent — unlocked, live, in range. Amber. */
  amber: '#D9A441',
  /** Alert / unresolved. Terracotta. */
  terracotta: '#C0563A',
} as const;

/**
 * The opacity ladder, as numbers.
 *
 * Six rungs. This is the whole secondary palette — any alpha that is not one of
 * these is a bug, so reach for a rung by name rather than typing a decimal.
 * Use these when a prop wants a number (`opacity`, a blur alpha, an
 * interpolation output); use `colors.tNN` when it wants a colour string.
 */
export const alpha = {
  /** Primary type, active glyph strokes. */
  full: 1,
  /** Body support, settled waveform stones, empty-state copy, Space wordmark. */
  support: 0.6,
  /** Metadata — author names, timestamps, distances, unplayed waveform. */
  meta: 0.4,
  /** Map contour lines, skeleton loaders. */
  contour: 0.2,
  /** Hairlines, dividers, card borders. */
  hairline: 0.12,
  /** Elevated surface fill over base. */
  surface: 0.06,
} as const;

/** Bone at an arbitrary alpha. Pass a rung from `alpha`, not a fresh decimal. */
export function bone(a: number): string {
  return `rgba(232, 227, 216, ${a})`;
}

/**
 * Semantic aliases. Use these in components so a palette change is one edit.
 * A per-Space accent overrides `accent` at render time (E5) — never hardcode
 * amber in a component that can belong to a Space.
 */
export const colors = {
  background: palette.base,
  contour: palette.bone,
  accent: palette.amber,
  unresolved: palette.terracotta,

  /**
   * The opacity ladder — bone at alpha. These six values are the whole
   * secondary palette. Any other alpha is a bug: pick the nearest rung.
   */
  t100: palette.bone,
  /** Body support, settled waveform stones, empty-state copy, Space wordmark. */
  t60: 'rgba(232, 227, 216, 0.60)',
  /** Metadata — author names, timestamps, distances, unplayed waveform. */
  t40: 'rgba(232, 227, 216, 0.40)',
  /** Map contour lines, skeleton loaders. */
  t20: 'rgba(232, 227, 216, 0.20)',
  /** Hairlines, dividers, card borders. */
  t12: 'rgba(232, 227, 216, 0.12)',
  /** Elevated surface fill over base (sheets, cards). No shadows — this is it. */
  t06: 'rgba(232, 227, 216, 0.06)',

  // Semantic aliases onto the ladder. Reach for these in type styles.
  text: palette.bone,
  textMuted: 'rgba(232, 227, 216, 0.60)',
  textFaint: 'rgba(232, 227, 216, 0.40)',
  hairline: 'rgba(232, 227, 216, 0.12)',
  surface: 'rgba(232, 227, 216, 0.06)',

  /**
   * The one colour in the app that is neither bone-at-alpha nor a palette hex:
   * base at 72%, behind a modal. It is the base colour, not a new one — the
   * screen underneath is the thing being dimmed, and dimming it with bone would
   * lift it instead. Defined once, here, so no sheet invents its own.
   */
  scrim: 'rgba(15, 30, 23, 0.72)',
} as const;

/**
 * Elevation. There are no shadows in this app: a raised surface is a 6% bone
 * fill and a 12% bone hairline, and that is the entire depth system.
 */
export const elevation = {
  /** Fill for anything sitting above the base — sheets, cards, chips. */
  surface: colors.t06,
  /** The border that goes with it. Always 1pt. */
  hairline: colors.t12,
  /** Border width for that hairline. */
  hairlineWidth: 1,
  /** Full-screen dim behind a modal. */
  scrim: colors.scrim,
} as const;

/**
 * Never more than two type sizes on a screen. Timestamps and distances are
 * mono at 11 with letterspacing — mono is a different register, not a third
 * size, so it does not count toward the two.
 *
 * Line height is 1.6 everywhere; React Native takes absolute points, so the
 * numbers below are the computed column from the design system.
 */
export const type: Record<'display' | 'body' | 'small' | 'mono', TextStyle> = {
  /** Screen title. One per screen. 28/45. */
  display: { fontSize: 28, lineHeight: 45, fontWeight: '500' },
  /** Default. 17/27. */
  body: { fontSize: 17, lineHeight: 27, fontWeight: '400' },
  /** Secondary lines inside a card. 13/21. */
  small: { fontSize: 13, lineHeight: 21, fontWeight: '400' },
  /**
   * Timestamps, distances, stone counts, join codes, author names. Nothing
   * else. Uppercase is baked in — callers pass their string as-is and never
   * hand-uppercase it. 40% opacity unless it is a join code (100%) or a
   * `HERE` label (amber, 100%).
   */
  mono: {
    fontSize: 11,
    lineHeight: 18,
    letterSpacing: 1.1,
    fontWeight: '400',
    textTransform: 'uppercase',
    fontVariant: ['tabular-nums'],
  },
};

/**
 * Layout. The vertical rhythm unit is 8pt and all vertical spacing is a
 * multiple of it — there is deliberately no 4pt step. Corner radius has
 * exactly three values; no others.
 */
export const s = {
  /** Screen horizontal gutter. */
  gutter: 24,
  /** Card / sheet padding. */
  pad: 20,
  /** Vertical rhythm unit. Multiply it; do not subdivide it. */
  unit: 8,
  /** Gap between stones in a thread. */
  thread: 24,
  /** Minimum tap target, 44 x 44. */
  tap: 44,
  /** Max text measure, in characters. */
  measure: 62,
  /** Hairlines, dividers, card borders, button outlines. One point. */
  hairline: 1,
  /** Glyph stroke — the cairn stack and the pin ring. One and a half points. */
  stroke: 1.5,
  r: {
    /** Waveform stones. */
    stone: 2,
    /** Chips, buttons, thumbnails. */
    chip: 8,
    /** Bottom sheets, full cards. */
    sheet: 16,
  },
} as const;

/**
 * Motion. Three durations, one easing (ease-out). Nothing faster than 200ms,
 * nothing slower than 400ms. No springs, no bounce, no stagger.
 */
export const motion = {
  /** State changes — press, sheet dismiss, colour transitions, a stone landing. */
  state: 200,
  /** Torch reveal on a photo pin. */
  torch: 260,
  /** Distance-driven interpolation — blur, opacity, sharpen. */
  distance: 400,
} as const;

/**
 * @deprecated Legacy alias for `s`. Multiples of the 8pt unit only — the 4pt
 * step is gone. Prefer `s.gutter` / `s.pad` / `s.unit` and the `s.r` radii,
 * which say what the number is for instead of how big it is.
 */
export const space = {
  sm: s.unit,
  md: s.unit * 2,
  lg: s.gutter,
  xl: s.unit * 5,
} as const;

/**
 * Proximity bands. The outer bound of the blur ramp is a product constant; the
 * inner bound is NOT — it is `cairns.radius_m`, read per cairn from the server.
 * Never hardcode 30 in a render path.
 */
export const proximity = {
  /** Beyond this, a cairn is a glyph and a distance number. Nothing else. */
  previewRadiusM: 200,
  /** Same number, under the design system's name for it. */
  outerM: 200,
  /**
   * Hysteresis. Unlock at `radius_m`, re-lock only above `radius_m * 1.5`.
   * Without this the card flickers between locked and unlocked while the user
   * stands perfectly still, because GPS is ±5–15m outdoors.
   */
  relockFactor: 1.5,
  /** Recompute the interpolation parameter at 1Hz. Animate the gap. */
  sampleHz: 1,
} as const;

/** Alias matching the token block in reference/design-system.md. */
export const prox = proximity;

/** Alias matching the token block in reference/design-system.md. */
export const c = {
  base: palette.base,
  contour: palette.bone,
  amber: palette.amber,
  terracotta: palette.terracotta,
  t60: colors.t60,
  t40: colors.t40,
  t20: colors.t20,
  t12: colors.t12,
  t06: colors.t06,
} as const;
