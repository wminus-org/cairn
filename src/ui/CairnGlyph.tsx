/**
 * The cairn glyph — stacked stones, height keyed to stone count so density
 * reads as terrain (CRN-007). Fixed screen-space size; anchored bottom-centre.
 *
 * Colour follows proximity first, identity second (design-system § glyph):
 *  - `here` (inside radius_m) → amber, wins over everything.
 *  - `accent` (Space cairn) → the Space's accent_hex.
 *  - otherwise contour bone.
 * `unresolved` adds a terracotta ring — an open pin somewhere in the stack.
 */
import { View } from 'react-native';

import { colors } from '../theme';

/** Stones drawn, and their widths from the base up (design-system table). */
function stack(count: number): number[] {
  const widths = [14, 12, 10, 9, 8];
  const stones = count >= 12 ? 5 : count >= 7 ? 4 : count >= 4 ? 3 : count >= 2 ? 2 : 1;
  return widths.slice(0, stones);
}

export function CairnGlyph({
  count,
  color,
  here = false,
  unresolved = false,
  scale = 1,
}: {
  count: number;
  /** Space accent, when the cairn belongs to a Space. Ignored while `here`. */
  color?: string;
  here?: boolean;
  unresolved?: boolean;
  scale?: number;
}) {
  const stroke = here ? colors.accent : color ?? colors.contour;
  const widths = stack(count);
  const stoneH = 4 * scale;
  const gap = 2 * scale;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
      {/* base is the last entry, so draw widest-at-bottom by reversing. */}
      {[...widths].reverse().map((w, i) => (
        <View
          key={i}
          style={{
            width: w * scale,
            height: stoneH,
            marginTop: i === 0 ? 0 : gap,
            borderRadius: 2,
            borderWidth: 1.5,
            borderColor: stroke,
            backgroundColor: colors.background,
          }}
        />
      ))}
      {unresolved ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 40 * scale,
            height: 40 * scale,
            borderRadius: 20 * scale,
            borderWidth: 1,
            borderColor: colors.alert,
            opacity: 0.6,
          }}
        />
      ) : null}
    </View>
  );
}
