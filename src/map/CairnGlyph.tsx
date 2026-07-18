/**
 * The cairn glyph: stacked stones, height encoding stone count.
 *
 * Built from plain Views because there is no SVG dependency in package.json
 * and adding one to draw five rounded rectangles would be a poor trade. Each
 * stone is an absolutely positioned rounded rect with a 1.5pt stroke and an
 * opaque base fill, so the stack reads as mass rather than as outlines: the
 * fill hides the stroke of the stone underneath where they overlap, which is
 * what makes it look stacked instead of listed.
 *
 * Geometry is the design system's table, not a re-derivation:
 *
 *   stones | glyph  | height
 *   1      | pebble |  8pt
 *   2–3    | 2      | 14pt
 *   4–6    | 3      | 20pt
 *   7–11   | 4      | 26pt
 *   12+    | 5      | 32pt
 *
 * Every step is +6pt, and a stone is 8pt tall, which means consecutive stones
 * overlap by exactly 2pt. That is not a fudge to make the numbers land — it is
 * the reason the numbers land, and it is also how real stones sit.
 *
 * Widths from the base upward are 14, 12, 10, 9, 8. Max glyph width is 14pt
 * and the glyph does not scale with map zoom.
 */
import { View } from 'react-native';

import { colors, s } from '../theme';

/** Height of one stone. */
const STONE_H = 8;
/** How much each additional stone adds to the total — a 2pt overlap. */
const RISE = 6;
/** Stone widths from the base upward. */
const WIDTHS = [14, 12, 10, 9, 8] as const;

/** Max glyph width, from the design system. Also the layout box width. */
export const GLYPH_W = WIDTHS[0];
/** Tallest a glyph can be: five stones. */
export const GLYPH_MAX_H = STONE_H + RISE * (WIDTHS.length - 1);

/** How many stones the glyph draws for a given stone count. */
export function stonesInGlyph(stoneCount: number): number {
  if (stoneCount >= 12) return 5;
  if (stoneCount >= 7) return 4;
  if (stoneCount >= 4) return 3;
  if (stoneCount >= 2) return 2;
  return 1;
}

/** Rendered height of the glyph for a given stone count. */
export function glyphHeight(stoneCount: number): number {
  return STONE_H + RISE * (stonesInGlyph(stoneCount) - 1);
}

export default function CairnGlyph({
  stoneCount,
  stroke,
}: {
  stoneCount: number;
  stroke: string;
}) {
  const count = stonesInGlyph(stoneCount);

  return (
    <View
      style={{ width: GLYPH_W, height: glyphHeight(stoneCount) }}
      // The count is the accessible content; colour carries nothing on its own.
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${stoneCount} ${stoneCount === 1 ? 'stone' : 'stones'}`}
    >
      {/* Base first so the stones above it paint over the join. */}
      {Array.from({ length: count }, (_, i) => {
        const w = WIDTHS[i] ?? WIDTHS[WIDTHS.length - 1];
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              bottom: i * RISE,
              left: (GLYPH_W - w) / 2,
              width: w,
              height: STONE_H,
              borderRadius: s.r.stone,
              borderWidth: 1.5,
              borderColor: stroke,
              // Opaque, so map tiles never read through the stack.
              backgroundColor: colors.background,
            }}
          />
        );
      })}
    </View>
  );
}
