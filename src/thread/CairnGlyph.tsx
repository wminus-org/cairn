/**
 * The cairn itself, drawn as an object rather than as a marker.
 *
 * Same geometry table as the map glyph (reference/design-system.md § Cairn
 * glyph) — height encodes stone count, widths taper from a 14pt base — but here
 * it is scaled up and used as the one hero element of the `far` band, where the
 * screen is allowed to show a stack and a distance and nothing else.
 *
 * Stroke stays 1.5pt at every scale. A stroke that scaled with the glyph would
 * turn a thin contour drawing into a fat cartoon at 3x; keeping it fixed is what
 * makes the large version read as the same pen as the small one.
 */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, palette, s } from '../theme';

/** Stones drawn, and the total glyph height, per stone count. Straight off the table. */
const TIERS: readonly { readonly upTo: number; readonly stones: number; readonly height: number }[] = [
  { upTo: 1, stones: 1, height: 8 },
  { upTo: 3, stones: 2, height: 14 },
  { upTo: 6, stones: 3, height: 20 },
  { upTo: 11, stones: 4, height: 26 },
  { upTo: Number.POSITIVE_INFINITY, stones: 5, height: 32 },
];

/** Base upward. Max glyph width is the first entry. */
const WIDTHS = [14, 12, 10, 9, 8];

const STROKE = 1.5;
const GAP = 1.5;

export interface CairnGlyphProps {
  stoneCount: number;
  /** 1 is the map size. The thread's far band draws it at 3. */
  scale?: number;
  /** Stroke colour. Amber only ever means "inside the radius" — not here. */
  color?: string;
}

function CairnGlyph({ stoneCount, scale = 1, color = colors.t100 }: CairnGlyphProps) {
  const tier = TIERS.find((entry) => stoneCount <= entry.upTo) ?? TIERS[TIERS.length - 1];
  const gap = GAP * scale;
  // Solve the per-stone height from the tier's total so the glyph matches the
  // table's silhouette instead of drifting taller as stones are added.
  const stoneHeight = (tier.height * scale - gap * (tier.stones - 1)) / tier.stones;
  const radius = scale > 1.5 ? s.r.chip : s.r.stone;

  return (
    <View style={[styles.stack, { gap }]} accessible={false}>
      {Array.from({ length: tier.stones }, (_, i) => (
        // column-reverse: index 0 is the base stone and sits on the ground.
        <View
          key={i}
          style={{
            width: WIDTHS[i] * scale,
            height: stoneHeight,
            borderWidth: STROKE,
            borderColor: color,
            // Filled with base at 100% so nothing reads through the glyph.
            backgroundColor: palette.base,
            borderRadius: radius,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Bottom-anchored: a cairn sits on its point, it is not centred over it.
  stack: { flexDirection: 'column-reverse', alignItems: 'center', alignSelf: 'flex-start' },
});

export default memo(CairnGlyph);
