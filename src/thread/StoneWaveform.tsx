/**
 * The stacked-stone waveform on a voice stone. Not a bar chart — a run of small
 * cairns, each column a stack that grew as somebody spoke.
 *
 * Geometry is straight out of reference/design-system.md and none of it is
 * negotiable: 24 columns, 3pt wide, 3pt apart, 1–6 stones each, stone 4pt tall
 * with a 2pt gap, 2pt corner radius. Columns are bottom-anchored because a
 * stack grows upward from the ground.
 *
 * `progress` is the playback seam. Today the thread passes `null` and every
 * column renders settled; when the signing route lands, feeding it 0–1 recolors
 * columns left to right in amber. That is the only progress indicator this app
 * gets — no bar, no scrubber, no elapsed/total pair.
 */
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { stoneStackBuckets, WAVEFORM_BUCKETS } from './stoneStack';
import { colors, s } from '../theme';

const COLUMN_WIDTH = 3;
const COLUMN_GAP = 3;
const STONE_HEIGHT = 4;
const STONE_GAP = 2;
const MAX_STONES = 6;

/** Tallest a column can get, so every waveform occupies the same band of the row. */
const TRACK_HEIGHT = MAX_STONES * STONE_HEIGHT + (MAX_STONES - 1) * STONE_GAP;

export interface StoneWaveformProps {
  /** Seeds the stack. The same id always draws the same shape. */
  stoneId: string;
  /**
   * Playback position 0–1, or `null` when nothing is playing — which is every
   * case until the audio signer exists. `null` renders settled (60%), not
   * "unplayed" (40%), so a thread at rest does not look greyed out.
   */
  progress?: number | null;
}

function StoneWaveform({ stoneId, progress = null }: StoneWaveformProps) {
  const buckets = useMemo(() => stoneStackBuckets(stoneId), [stoneId]);
  const playedColumns = progress === null ? -1 : Math.round(progress * WAVEFORM_BUCKETS);

  return (
    <View style={styles.track}>
      {buckets.map((count, column) => {
        const color =
          progress === null
            ? colors.t60
            : column < playedColumns
              ? colors.accent
              : colors.t40;

        return (
          // Index keys are correct here: the array is fixed-length, positional,
          // and never reordered or spliced.
          <View key={column} style={styles.column}>
            {Array.from({ length: count }, (_, stone) => (
              <View key={stone} style={[styles.stone, { backgroundColor: color }]} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: TRACK_HEIGHT,
    gap: COLUMN_GAP,
  },
  column: {
    // Column children are laid out bottom-up so the stack reads as growing off
    // the baseline rather than hanging from the top of the row.
    flexDirection: 'column-reverse',
    width: COLUMN_WIDTH,
    gap: STONE_GAP,
  },
  stone: {
    width: COLUMN_WIDTH,
    height: STONE_HEIGHT,
    borderRadius: s.r.stone,
  },
});

export default memo(StoneWaveform);
