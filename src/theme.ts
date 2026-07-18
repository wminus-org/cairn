import type { TextStyle } from 'react-native';

/**
 * Cairn design tokens — from "Cairn RN Wireframes" (claude.ai/design, JUL 18).
 *
 * The wireframe supersedes the old PLAN.md palette: deep blue-green base,
 * bone ink, ORANGE accent (#FF5A1F). Square corners everywhere — the only
 * circles are avatars, record buttons and map dots. Elevation is a 1px
 * hairline plus a solid surface fill; no shadows except the accent glow
 * behind the mic button.
 */

export const palette = {
  /** Base. Every screen background. */
  base: '#091C1E',
  /** Darker sheet/modal background (save screen, share sheet). */
  baseDeep: '#07171A',
  /** Solid raised surface — avatar circles, AI bubbles, stat cards. */
  surface: '#0C2528',
  /** Ink. All primary type and line-work. */
  ink: '#EAE6DA',
  /** Accent — live, active, recording, unlocked. Orange. */
  accent: '#FF5A1F',
} as const;

/**
 * Semantic aliases. Use these in components so a palette change is one edit.
 */
export const colors = {
  background: palette.base,
  backgroundDeep: palette.baseDeep,
  surfaceSolid: palette.surface,
  contour: palette.ink,
  accent: palette.accent,

  /** Ink at alpha — the whole secondary palette. Pick the nearest rung. */
  t100: palette.ink,
  t70: 'rgba(234, 230, 218, 0.70)',
  t60: 'rgba(234, 230, 218, 0.60)',
  t45: 'rgba(234, 230, 218, 0.45)',
  t40: 'rgba(234, 230, 218, 0.40)',
  t35: 'rgba(234, 230, 218, 0.35)',
  t25: 'rgba(234, 230, 218, 0.25)',
  t18: 'rgba(234, 230, 218, 0.18)',
  t16: 'rgba(234, 230, 218, 0.16)',
  t12: 'rgba(234, 230, 218, 0.12)',
  t08: 'rgba(234, 230, 218, 0.08)',

  /** Accent at alpha — rings, glows, heat map circles, active borders. */
  accent50: 'rgba(255, 90, 31, 0.50)',
  accent30: 'rgba(255, 90, 31, 0.30)',
  accent18: 'rgba(255, 90, 31, 0.18)',
  accent12: 'rgba(255, 90, 31, 0.12)',

  // Semantic aliases onto the ladder.
  text: palette.ink,
  textMuted: 'rgba(234, 230, 218, 0.60)',
  textFaint: 'rgba(234, 230, 218, 0.45)',
  hairline: 'rgba(234, 230, 218, 0.16)',
  hairlineFaint: 'rgba(234, 230, 218, 0.08)',
  border: 'rgba(234, 230, 218, 0.25)',
  surface: 'rgba(234, 230, 218, 0.06)',
  /** Translucent bar over the map. */
  scrim: 'rgba(9, 28, 30, 0.90)',
} as const;

/**
 * Font families. General Sans is not bundled — the system face (SF Pro on
 * iOS) with matching weights is the sanctioned fallback. Space Mono and
 * Instrument Serif italic load in app/_layout.tsx via expo-font; if the
 * fonts have not resolved yet these families silently fall back, so no
 * screen needs to gate on font readiness.
 */
export const fonts = {
  /** Labels, timestamps, distances, codes. Always uppercase + letterspaced. */
  mono: 'SpaceMono_400Regular',
  monoBold: 'SpaceMono_700Bold',
  /** Display headings — "Leave a note where it happened". Always italic. */
  serif: 'InstrumentSerif_400Regular_Italic',
} as const;

/**
 * Type scale from the wireframe. `mono` variants carry the Space Mono face
 * and em-tracked uppercase; everything else is the system sans.
 */
export const type: Record<
  'hero' | 'displaySerif' | 'title' | 'heading' | 'body' | 'small' | 'mono' | 'monoSmall' | 'monoTiny',
  TextStyle
> = {
  /** Big numerals — the recording timer. */
  hero: { fontSize: 52, lineHeight: 56, fontWeight: '600', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  /** Serif italic display — splash wordmark, sheet titles. */
  displaySerif: { fontFamily: fonts.serif, fontStyle: 'italic', fontSize: 40, lineHeight: 46 },
  /** Screen title — "Valve on the north wall". */
  title: { fontSize: 26, lineHeight: 32, fontWeight: '600', letterSpacing: -0.3 },
  /** Section/card heading — note row titles, "Projects". */
  heading: { fontSize: 16, lineHeight: 22, fontWeight: '500' },
  /** Default body / transcript text. */
  body: { fontSize: 16, lineHeight: 28 },
  /** Secondary lines inside a row. */
  small: { fontSize: 13, lineHeight: 21 },
  /** Mono label. Callers pass strings as-is; uppercase is baked in. */
  mono: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    fontVariant: ['tabular-nums'],
  },
  /** Small mono — chips, bylines. */
  monoSmall: {
    fontFamily: fonts.mono,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    fontVariant: ['tabular-nums'],
  },
  /** Tiny mono — badges inside rows. */
  monoTiny: {
    fontFamily: fonts.mono,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    fontVariant: ['tabular-nums'],
  },
};

/**
 * Layout. Corners are SQUARE — radius exists only for circles (avatar, mic,
 * play buttons, map dots): use half the element size, or `s.r.circle` for
 * "make it round".
 */
export const s = {
  /** Screen horizontal gutter. */
  gutter: 22,
  /** Card / sheet padding. */
  pad: 18,
  /** Vertical rhythm unit. */
  unit: 8,
  /** Minimum tap target, 44 x 44. */
  tap: 44,
  r: {
    /** Everything rectangular. */
    square: 0,
    /** "Make it a circle" — pair with equal width/height. */
    circle: 999,
  },
  /** The primary record button diameter. */
  mic: 76,
  /** Secondary nav circle diameter. */
  navCircle: 52,
} as const;

/** @deprecated Legacy alias for `s`. */
export const space = {
  sm: s.unit,
  md: s.unit * 2,
  lg: s.gutter,
  xl: s.unit * 5,
} as const;

/** Motion: three durations, one easing (ease-out). */
export const motion = {
  state: 200,
  reveal: 260,
  distance: 400,
} as const;

/**
 * Proximity bands, in metres. The outer bound of the blur ramp is a product
 * constant; the inner bound is NOT — it is `cairns.radius_m`, read per cairn
 * from the server. Never hardcode 30 in a render path.
 */
export const proximity = {
  previewRadiusM: 200,
} as const;
