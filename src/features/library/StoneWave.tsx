/**
 * The stacked-stone waveform, preview variant (design-system § "As a preview on
 * a stone card"). 24 columns of 1–6 stones, synthesised DETERMINISTICALLY from
 * the stone id so the same stone draws the same shape on every device and every
 * render — the server sends no amplitude data (CRN-005).
 *
 * Playback progress recolours columns left→right in amber. That is the only
 * progress indicator the design allows: no bar, no scrubber, no time pair.
 */
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '../../theme';

const COLUMNS = 24;

/** id → 24 bucket values in 1..6. Cheap FNV-ish hash walked per column. */
function buckets(seed: string): number[] {
  const out: number[] = [];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  for (let col = 0; col < COLUMNS; col++) {
    // Advance the hash per column so neighbours differ.
    h ^= col + 0x9e3779b9;
    h = Math.imul(h, 16777619);
    out.push(1 + (Math.abs(h) % 6));
  }
  return out;
}

export function StoneWave({
  seed,
  progress = 0,
  height = 44,
  active = false,
}: {
  /** Stable identity of the stone — its id. */
  seed: string;
  /** 0..1 played fraction. Columns left of it render amber. */
  progress?: number;
  height?: number;
  /** Currently the playing/selected stone: unplayed columns brighten to 60%. */
  active?: boolean;
}) {
  const cols = useMemo(() => buckets(seed), [seed]);
  const playedCols = Math.round(progress * COLUMNS);

  return (
    <View style={[styles.row, { height }]}>
      {cols.map((n, i) => {
        const played = i < playedCols;
        const color = played ? colors.accent : active ? colors.t60 : colors.t40;
        return (
          <View key={i} style={styles.col}>
            {Array.from({ length: n }).map((_, s) => (
              <View key={s} style={[styles.stone, { backgroundColor: color }]} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  col: { width: 3, flexDirection: 'column-reverse', gap: 2 },
  stone: { width: 3, height: 4, borderRadius: 2 },
});
