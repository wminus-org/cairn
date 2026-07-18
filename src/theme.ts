/**
 * Cairn design tokens.
 *
 * The palette is the one from PLAN.md, verbatim. Four hex values, no more.
 * Field journal, not social app — the restraint is the design.
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
 * Semantic aliases. Use these in components so a palette change is one edit.
 * A per-Space accent overrides `accent` at render time (E5) — never hardcode
 * amber in a component that can belong to a Space.
 */
export const colors = {
  background: palette.base,
  text: palette.bone,
  textMuted: 'rgba(232, 227, 216, 0.60)',
  textFaint: 'rgba(232, 227, 216, 0.35)',
  contour: palette.bone,
  accent: palette.amber,
  unresolved: palette.terracotta,
  hairline: 'rgba(232, 227, 216, 0.12)',
} as const;

/**
 * Never more than two type sizes on a screen. Timestamps and distances are
 * mono at 11 with letterspacing — that is the only place mono appears.
 */
export const type = {
  title: { fontSize: 22, lineHeight: 22 * 1.6 },
  body: { fontSize: 16, lineHeight: 16 * 1.6 },
  mono: {
    fontSize: 11,
    lineHeight: 11 * 1.6,
    letterSpacing: 1.1,
    fontVariant: ['tabular-nums'] as const,
  },
} as const;

/** Generous margins. One scale, used everywhere. */
export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
} as const;

/**
 * Proximity bands, in metres. The outer bound of the blur ramp is a product
 * constant; the inner bound is NOT — it is `cairns.radius_m`, read per cairn
 * from the server. Never hardcode 30 in a render path.
 */
export const proximity = {
  /** Beyond this, a cairn is a glyph and a distance number. Nothing else. */
  previewRadiusM: 200,
} as const;
