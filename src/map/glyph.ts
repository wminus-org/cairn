/**
 * Cairn glyph geometry, bucketing and colour — the pure half of CRN-007.
 *
 * No React, no Mapbox, no react-native imports live here on purpose: every
 * number in this file comes straight out of `tracker/reference/design-system.md`
 * ("Cairn glyph"), and keeping it dependency-free means the buckets can be
 * asserted in a plain node script if anyone ever doubts them.
 *
 * Look values up here rather than re-deriving them. They are decisions that
 * have already been made.
 */

import { palette } from '../theme';

/* -------------------------------------------------------------------------- */
/* Input shape                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The tier-1 fields the glyph layer needs, and nothing more.
 *
 * This is deliberately a *structural minimum* rather than an import of
 * `CairnSummary` from `src/lib/cairnApi.ts` (CRN-005, in flight in parallel).
 * Both `CairnMarker` in `src/lib/database.types.ts` and CRN-005's
 * `CairnSummary` satisfy it, so the map renders against either without this
 * ticket taking a hard build dependency on a file that may not exist yet.
 * `accent_hex` / `space_id` are widened to include `null` so a nullable
 * declaration on either side stays assignable.
 *
 * Note what is absent, and keep it absent: no audio_url, no transcript, no
 * image_url. The map is a tier-1 surface. If a gated field ever appears in
 * this interface, something upstream has leaked.
 */
export interface CairnGlyphDatum {
  id: string;
  lat: number;
  lng: number;
  space_id: string | null;
  accent_hex: string | null;
  stone_count: number;
  distance_m: number;
}

/* -------------------------------------------------------------------------- */
/* Buckets                                                                    */
/* -------------------------------------------------------------------------- */

export type GlyphBucketId = 's1' | 's2' | 's3' | 's4' | 's5';

export interface GlyphBucket {
  id: GlyphBucketId;
  /** Lowest stone count that lands in this bucket. */
  minStones: number;
  /** Number of stones drawn. */
  stones: number;
  /** Total glyph height in points, from design-system.md. */
  heightPt: number;
}

/**
 * Five buckets. Not six, and not a unique glyph per exact count — an unbounded
 * asset set and a layer expression nobody can debug. Straight from the
 * design-system table:
 *
 *   1     single pebble   8pt
 *   2–3   2 stones       14pt
 *   4–6   3 stones       20pt
 *   7–11  4 stones       26pt
 *   12+   5 stones       32pt
 *
 * Ordered ascending; `bucketFor` scans from the top down.
 */
export const GLYPH_BUCKETS: readonly GlyphBucket[] = [
  { id: 's1', minStones: 1, stones: 1, heightPt: 8 },
  { id: 's2', minStones: 2, stones: 2, heightPt: 14 },
  { id: 's3', minStones: 4, stones: 3, heightPt: 20 },
  { id: 's4', minStones: 7, stones: 4, heightPt: 26 },
  { id: 's5', minStones: 12, stones: 5, heightPt: 32 },
] as const;

/**
 * Stone widths from the base upward, in points. Max glyph width is the first
 * entry — a cairn tapers as it rises.
 */
export const STONE_WIDTHS_PT: readonly number[] = [14, 12, 10, 9, 8];

/** Every stone is the same height; only the width tapers. */
export const STONE_HEIGHT_PT = 8;

/**
 * Vertical advance per stone. Note this is *less* than STONE_HEIGHT_PT: each
 * stone sits 2pt into the one below it, because stones rest on each other
 * rather than float in a column. It is also what makes the design-system
 * heights come out exactly:
 *
 *   height(n) = (n - 1) * 6 + 8  →  8, 14, 20, 26, 32
 *
 * `assertBucketGeometry()` below checks that identity rather than trusting it.
 */
export const STONE_RISE_PT = 6;

/** Widest stone, so every bucket image shares one canvas width. */
export const GLYPH_WIDTH_PT = STONE_WIDTHS_PT[0] ?? 14;

/** Stroke weight and corner radius, from design-system.md. */
export const GLYPH_STROKE_PT = 1.5;
export const GLYPH_RADIUS_PT = 2;

/** The tallest bucket, used to size the tap hitbox and any layout reserve. */
export const GLYPH_MAX_HEIGHT_PT = 32;

/**
 * Bucket a raw stone count. Counts below 1 clamp to `s1` — a cairn cannot
 * exist with zero stones, but a stale feed should still draw something rather
 * than crash or vanish.
 */
export function bucketFor(stoneCount: number): GlyphBucket {
  const fallback = GLYPH_BUCKETS[0] as GlyphBucket;
  if (!Number.isFinite(stoneCount)) return fallback;
  for (let i = GLYPH_BUCKETS.length - 1; i >= 0; i -= 1) {
    const bucket = GLYPH_BUCKETS[i] as GlyphBucket;
    if (stoneCount >= bucket.minStones) return bucket;
  }
  return fallback;
}

/**
 * Self-check for the geometry table. Not called in the render path; exported so
 * a smoke test or a REPL can prove the drawn heights match the spec heights.
 * Returns the mismatches, empty array = good.
 */
export function assertBucketGeometry(): string[] {
  return GLYPH_BUCKETS.flatMap((bucket) => {
    const drawn = (bucket.stones - 1) * STONE_RISE_PT + STONE_HEIGHT_PT;
    if (drawn === bucket.heightPt) return [];
    return [`${bucket.id}: spec ${bucket.heightPt}pt but geometry draws ${drawn}pt`];
  });
}

/* -------------------------------------------------------------------------- */
/* Colour                                                                     */
/* -------------------------------------------------------------------------- */

const HEX_RE = /^#?([0-9a-fA-F]{6})$/;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): Rgb | null {
  const match = HEX_RE.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1] as string, 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

function toHex({ r, g, b }: Rgb): string {
  const part = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

/** WCAG relative luminance. */
function luminance({ r, g, b }: Rgb): number {
  const channel = (raw: number): number => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastAgainstBase(rgb: Rgb): number {
  const base = parseHex(palette.base);
  const lBase = base ? luminance(base) : 0;
  const lFg = luminance(rgb);
  const [hi, lo] = lFg >= lBase ? [lFg, lBase] : [lBase, lFg];
  return (hi + 0.05) / (lo + 0.05);
}

/** Contrast floor for a Space accent against the base, from design-system.md. */
const MIN_CONTRAST = 4.5;

/**
 * Lift a Space accent until it clears 4.5:1 against `#0F1E17`.
 *
 * design-system.md is explicit that a too-dark accent is *lightened
 * programmatically* rather than rejected — "a rejected color in a demo is a bug
 * on stage". An accent that fails the floor here would render as a glyph you
 * cannot see on the map, which is the one place this rule is load-bearing.
 * Mixes toward white in 5% steps; terminates because pure white always passes.
 */
export function ensureLegibleAccent(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return palette.bone;

  let current = rgb;
  for (let step = 0; step < 20; step += 1) {
    if (contrastAgainstBase(current) >= MIN_CONTRAST) break;
    current = {
      r: current.r + (255 - current.r) * 0.05,
      g: current.g + (255 - current.g) * 0.05,
      b: current.b + (255 - current.b) * 0.05,
    };
  }
  return toHex(current);
}

/**
 * The stroke colour for one cairn's glyph.
 *
 * Personal cairns (`space_id === null`) are contour bone. A Space cairn takes
 * that Space's `accent_hex` off the server row — never a hardcoded Space
 * colour, and never amber.
 *
 * On amber: design-system.md permits amber on a glyph in exactly one case —
 * the user standing inside that cairn's `radius_m` — and restraint rule 10
 * makes any other use a bug, because amber is the payoff of the whole distance
 * mechanic. That in-radius state is CRN-015's proximity pass and is
 * deliberately not wired here. See the note in CairnGlyphs.tsx.
 */
export function glyphStroke(cairn: CairnGlyphDatum): string {
  if (!cairn.space_id) return palette.bone;
  if (!cairn.accent_hex) return palette.bone;
  return ensureLegibleAccent(cairn.accent_hex);
}

/* -------------------------------------------------------------------------- */
/* Distance label                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Outer edge of the approach band. A product constant, unlike `radius_m` —
 * which is per-cairn and read from the server, never hardcoded.
 */
export const FAR_BAND_M = 200;

/**
 * Distance as it appears next to a glyph: `240 M` under a kilometre, `1.2 KM`
 * above it. Uppercase is applied by the layer's `textTransform`, so the string
 * itself stays plain.
 *
 * Scoped to the map label on purpose. The `HERE` case (inside `radius_m`,
 * amber, 100%) is not here — that is a proximity state owned by CRN-015, and
 * duplicating it now would mean two formatters disagreeing later. If a shared
 * distance formatter lands elsewhere, hoist this into it.
 */
export function distanceLabel(distanceM: number): string {
  if (!Number.isFinite(distanceM) || distanceM < 0) return '';
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  return `${(distanceM / 1000).toFixed(1)} km`;
}

/**
 * Per the plan: "Beyond 200m: the cairn is a glyph and a distance number.
 * Nothing else." Inside 200m the number is part of the approach treatment and
 * belongs to CRN-015, so this layer draws no label there.
 */
export function shouldLabel(distanceM: number): boolean {
  return Number.isFinite(distanceM) && distanceM > FAR_BAND_M;
}

/* -------------------------------------------------------------------------- */
/* Image registry naming                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Name under which one (bucket × stroke colour) glyph is registered with the
 * map's image registry, e.g. `cairn-s4-D9A441`.
 *
 * The SymbolLayer resolves image *names*, so this function must be the only
 * place the name is built — it is used both to register the image and to write
 * the `icon` property onto each feature. A typo that split those two apart
 * yields no icon and no error, which is the expensive failure in this ticket.
 */
export function glyphImageName(bucket: GlyphBucketId, strokeHex: string): string {
  return `cairn-${bucket}-${strokeHex.replace('#', '').toUpperCase()}`;
}
