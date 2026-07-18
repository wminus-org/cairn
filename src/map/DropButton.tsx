/**
 * The primary action on the map.
 *
 * It used to be a full-width amber bar. Amber is the only thing in this app
 * that means *you are standing somewhere and it has opened to you* — it is the
 * payoff of the entire distance mechanic — and a permanent amber slab across
 * the bottom of the screen burns that signal on chrome. By the time the walker
 * reaches a cairn and the glyph turns amber, the eye has been ignoring amber
 * for ten minutes.
 *
 * So the button earns primacy from form, weight and position instead of
 * saturation, exactly as the design system prescribes for primary buttons:
 * contour on base with a 1pt contour border.
 *
 *  - **Position.** Bottom of the screen, gutter to gutter. Nothing else is
 *    down there.
 *  - **Mass.** 56pt tall and opaque. It is the only solid object on a live
 *    map; everything else on this screen is type floating on a wash.
 *  - **Weight.** A full-strength bone border against a base fill is the
 *    highest-contrast edge on the screen, and it costs no colour.
 *
 * Without a fix there is nowhere to put a cairn, so the button goes quiet and
 * says so. The state is carried by the label as well as by the border, never
 * by colour alone.
 */
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, s, type } from '../theme';

export default function DropButton({
  ready,
  onPress,
}: {
  ready: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        !ready && styles.buttonWaiting,
        pressed && ready && styles.buttonPressed,
      ]}
      onPress={onPress}
      disabled={!ready}
      accessibilityRole="button"
      accessibilityState={{ disabled: !ready }}
      accessibilityLabel={
        ready ? 'Leave something here' : 'Waiting for position before you can leave anything'
      }
    >
      <Text style={[styles.label, !ready && styles.labelWaiting]}>
        {ready ? 'Leave something here' : 'Waiting for position'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    marginHorizontal: s.gutter,
    marginBottom: s.unit * 2,
    // Comfortably past the 44pt floor; this is a one-handed outdoor target.
    height: s.tap + 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: s.r.chip,
    borderWidth: 1,
    borderColor: colors.contour,
    // Opaque, so it never dissolves into a bright map tile.
    backgroundColor: colors.background,
  },
  /** 200ms is for state changes; a press is immediate feedback, not a state. */
  buttonPressed: { opacity: 0.6 },
  buttonWaiting: { borderColor: colors.t20 },
  label: { ...type.mono, color: colors.contour },
  labelWaiting: { color: colors.t40 },
});
