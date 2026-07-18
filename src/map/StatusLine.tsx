/**
 * The map's one line of text. It is a readout on an instrument, not a banner:
 * no slab, no card, no chrome — it sits directly on the scrim in the gutter,
 * left-aligned, mono.
 *
 * The tick to its left is the whole indicator vocabulary of this screen. At
 * rest it is a hairline. While a nearby query is in flight it breathes between
 * two rungs of the opacity ladder over 400ms. That replaces the spinner: the
 * design system forbids spinners, and a rotating iOS activity indicator on a
 * projector is the single most "hackathon demo" object available.
 *
 * `Animated` from React Native, deliberately. `react-native-reanimated` is in
 * package.json but there is no babel.config.js in this project, so its worklet
 * plugin is not configured and anything built on it would fail at runtime in
 * Expo Go.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { colors, s, type } from '../theme';

/** State changes are 200ms; distance-driven motion is 400ms. This is the latter. */
const BREATH_MS = 400;

export default function StatusLine({ text, busy }: { text: string; busy: boolean }) {
  const tick = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!busy) {
      // Settle back rather than snapping, so a fast query is not a flash.
      const settle = Animated.timing(tick, {
        toValue: 1,
        duration: BREATH_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      });
      settle.start();
      return () => settle.stop();
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(tick, {
          toValue: 0.3,
          duration: BREATH_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(tick, {
          toValue: 1,
          duration: BREATH_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [busy, tick]);

  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      <Animated.View style={[styles.tick, { opacity: tick }]} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: s.unit,
    paddingHorizontal: s.gutter,
    paddingTop: s.unit,
  },
  /**
   * A 1pt rule, one mono line tall. Not an icon — the design system allows
   * three glyphs and this is not one of them, it is a scale mark.
   */
  tick: {
    width: 1,
    height: 18,
    // 40% at rest, and the 0.3 floor of the breath lands it on the 12%
    // hairline rung exactly. Both ends of the animation are real ladder
    // values, which is why it never looks like a dimming bug.
    backgroundColor: colors.t40,
  },
  text: {
    ...type.mono,
    color: colors.contour,
    flexShrink: 1,
    // 62 characters at 11pt mono is roughly the whole gutter-to-gutter width;
    // the longest state ("Location is off…") wraps to two lines and that is
    // the intended shape, not an overflow.
  },
});
