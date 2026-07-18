/**
 * Everything that sits inside a react-native-maps `Marker` for one cairn: the
 * distance readout, the proximity halo, and the glyph.
 *
 * ## Why the box is a fixed size
 *
 * iOS snapshots a Marker's children into a bitmap. Anything that reflows after
 * the snapshot is lost, and anything that changes size forces a re-snapshot. So
 * the box is a constant 64 x 82 for every cairn regardless of stone count, and
 * the glyph grows *inside* it, bottom-anchored. One size, one anchor, no
 * per-cairn layout maths.
 *
 * ## Where the coordinate actually is
 *
 * A cairn sits on its point; it is not centred over it. The base of the stack
 * is at y = 58 in an 82pt box, so `MARKER_ANCHOR.y = 58/82`. The 24pt of box
 * below that line is not padding — it is room for the amber halo, whose centre
 * is the coordinate and which therefore extends 24pt below the stack. Put the
 * halo outside the box and iOS clips it.
 *
 * The distance sits *above* the glyph rather than below it for the same
 * reason: below, it would have to live inside the halo's space and the anchor
 * would move with the label's presence.
 *
 * ## Contrast over Apple's tiles
 *
 * The map base cannot be restyled, so every element here has to survive both a
 * near-white tile and a near-black one. The glyph does it by construction —
 * base fill against light tiles, bone stroke against dark. The distance does it
 * with a solid base chip behind it. Neither depends on the scrim.
 */
import { Text, View } from 'react-native';

import { colors, s, type } from '../theme';
import CairnGlyph, { GLYPH_MAX_H, GLYPH_W } from './CairnGlyph';

/** Mono line box. */
const LABEL_H = 18;
/** Rhythm unit between the readout and the stack. */
const LABEL_GAP = s.unit;
/** Amber halo: 1pt ring at 24pt radius, centred on the coordinate. */
const HALO_R = 24;

const MARKER_W = 64;
/** Distance from the top of the box down to the base of the stack. */
const BASE_Y = LABEL_H + LABEL_GAP + GLYPH_MAX_H;
const MARKER_H = BASE_Y + HALO_R;

/**
 * Bottom-centre of the stack, as a fraction of the box. Constant, because the
 * box is. Pass straight to `Marker.anchor`.
 */
export const MARKER_ANCHOR = { x: 0.5, y: BASE_Y / MARKER_H } as const;

/**
 * The design system's distance table. `radius_m` is per cairn and read from
 * the row — never the hardcoded 30.
 *
 * This is a *formatting* decision about a number the server already sent, not
 * a gate: nothing is revealed or withheld here. The band that decides what a
 * thread may show is computed server-side in `cairn_detail`.
 */
export function formatDistance(distanceM: number, radiusM: number): string {
  if (distanceM < radiusM) return 'HERE';
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  return `${(distanceM / 1000).toFixed(1)} km`;
}

export default function CairnMarkerBody({
  stoneCount,
  distanceM,
  radiusM,
  stroke,
}: {
  stoneCount: number;
  distanceM: number;
  radiusM: number;
  stroke: string;
}) {
  const here = distanceM < radiusM;
  const label = formatDistance(distanceM, radiusM);

  return (
    <View style={{ width: MARKER_W, height: MARKER_H }}>
      {/* Distance readout, floated above the stack like an altitude mark. */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' }}>
        <View
          style={{
            height: LABEL_H,
            justifyContent: 'center',
            paddingHorizontal: 6,
            borderRadius: s.r.chip,
            backgroundColor: colors.background,
          }}
        >
          <Text
            numberOfLines={1}
            style={[
              type.mono,
              // Distances are metadata: 40%, the same rung they sit on inside
              // a thread. The solid chip behind them, not a brighter ink, is
              // what carries them over live tiles — and holding the rung keeps
              // the full contrast step to the amber HERE that replaces them.
              // HERE is the one amber thing on this screen and it is a word
              // change too, never colour alone.
              { color: here ? colors.accent : colors.t40 },
            ]}
          >
            {label}
          </Text>
        </View>
      </View>

      {/* Amber ring, centred on the coordinate. Only inside the radius. */}
      {here ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: MARKER_W / 2 - HALO_R,
            top: BASE_Y - HALO_R,
            width: HALO_R * 2,
            height: HALO_R * 2,
            borderRadius: HALO_R,
            borderWidth: 1,
            borderColor: colors.accent,
          }}
        />
      ) : null}

      {/* The stack, standing on the coordinate. */}
      <View
        style={{
          position: 'absolute',
          left: MARKER_W / 2 - GLYPH_W / 2,
          bottom: MARKER_H - BASE_Y,
        }}
      >
        <CairnGlyph stoneCount={stoneCount} stroke={stroke} />
      </View>
    </View>
  );
}
