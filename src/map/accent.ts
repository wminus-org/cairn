/**
 * Which colour a cairn glyph is stroked in.
 *
 * Three rules from the design system, in priority order:
 *
 *  1. **Proximity outranks identity.** Inside `radius_m` the stroke is amber,
 *     whatever the Space says. Amber means "open to you" and nothing else.
 *  2. A Space cairn is stroked in `spaces.accent_hex`.
 *  3. A personal cairn is bone `#E8E3D8`. No accent, no chip.
 *
 * Rule 3 is why `space_id` is the discriminator here and not `accent_hex`:
 * `cairns_nearby` coalesces a null accent to `'#D9A441'` (0004, line 342), so a
 * personal cairn arrives from the server already wearing amber. Painting it is
 * the exact failure the palette warns about — every marker on the map lit up
 * as "live", and the one cairn you can actually open looks like all the others.
 *
 * The contrast floor is also from the design system: an org that picks
 * something dark gets it lightened until it clears 4.5:1 against the base,
 * because a rejected colour in a demo is a bug on stage.
 */
import { colors, palette } from '../theme';

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** WCAG relative luminance of an `#RRGGBB` string. */
function luminance(hex: string): number {
  const channel = (i: number): number => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

const BASE_LUMINANCE = luminance(palette.base);

function contrastAgainstBase(hex: string): number {
  const l = luminance(hex);
  const [hi, lo] = l > BASE_LUMINANCE ? [l, BASE_LUMINANCE] : [BASE_LUMINANCE, l];
  return (hi + 0.05) / (lo + 0.05);
}

/** Mix `hex` toward white by `amount` (0–1). */
function lighten(hex: string, amount: number): string {
  const mix = (i: number): string => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    return Math.round(v + (255 - v) * amount)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${mix(0)}${mix(1)}${mix(2)}`;
}

/**
 * A Space accent that is guaranteed to be a valid hex and guaranteed legible
 * on the base. Lightens in 8% steps rather than rejecting — twelve steps is
 * enough to drag anything short of pure black over the line.
 */
export function legibleAccent(accentHex: string | null | undefined): string {
  if (!accentHex || !HEX.test(accentHex)) return colors.contour;
  let out = accentHex;
  for (let i = 0; i < 12 && contrastAgainstBase(out) < 4.5; i += 1) {
    out = lighten(out, 0.08);
  }
  return out;
}

/**
 * The stroke for one marker. `here` is the server's own verdict — never a
 * distance the client re-derived.
 */
export function glyphStroke(args: {
  spaceId: string | null;
  accentHex: string | null | undefined;
  here: boolean;
}): string {
  if (args.here) return colors.accent;
  if (args.spaceId === null) return colors.contour;
  return legibleAccent(args.accentHex);
}
