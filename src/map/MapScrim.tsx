/**
 * A dark scrim at the top and bottom of the map, so bone type stays readable
 * whether Apple has put a snow field or a motorway tunnel under it.
 *
 * There is no gradient library in package.json and `expo-linear-gradient` is
 * not a dependency, so the ramp is built from a run of flat bands. With 24
 * bands over ~180pt each band is 7pt tall and the alpha step is small enough
 * that it reads as a wash rather than as stripes. The curve is quadratic, not
 * linear: a linear scrim has a visible hard edge where it ends, because the
 * eye tracks the rate of change and a linear ramp's rate changes abruptly at
 * the tail.
 *
 * This is base `#0F1E17` at alpha, not bone, so it is outside the opacity
 * ladder — the ladder governs secondary tones of `#E8E3D8`. A scrim is not a
 * tone, it is the surface the type is printed on.
 */
import { StyleSheet, View } from 'react-native';

import { palette } from '../theme';

const BANDS = 24;

/** Base at alpha, no other hex. */
function wash(alpha: number): string {
  return `rgba(15, 30, 23, ${alpha.toFixed(3)})`;
}

function Ramp({ height, max, from }: { height: number; max: number; from: 'top' | 'bottom' }) {
  const band = height / BANDS;
  return (
    <View style={{ height }} pointerEvents="none">
      {Array.from({ length: BANDS }, (_, i) => {
        // 0 at the outer edge, 1 where the scrim dies away.
        const t = (i + 0.5) / BANDS;
        const d = from === 'top' ? t : 1 - t;
        return <View key={i} style={{ height: band, backgroundColor: wash(max * (1 - d) ** 2) }} />;
      })}
    </View>
  );
}

export default function MapScrim() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.root]} pointerEvents="none">
      {/*
        Sized to the UI, not to taste. The quadratic means the genuinely dark
        part of each ramp is only its outer ~40pt — at the halfway mark the
        wash is already down to a quarter of `max` — so a cairn standing in
        the middle of the ramp loses very little. That matters: the scrim sits
        above the map, and anything it dims is a marker somebody has to read.

        0.72 over a white snow tile lands the surface near rgb(82,82,82),
        which carries bone type at full strength. That is the number this is
        sized for; going darker buys nothing and costs markers.
      */}
      <Ramp height={150} max={0.72} from="top" />
      <Ramp height={190} max={0.82} from="bottom" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { justifyContent: 'space-between' },
});
