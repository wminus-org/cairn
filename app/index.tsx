import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { missingEnv } from '../src/env';
import { colors, space, type } from '../src/theme';

/**
 * Placeholder screen. CRN-001 ends here on purpose.
 *
 * The map is CRN-006, cairn glyphs are CRN-007, live position is CRN-008,
 * hold-to-record is CRN-010. Nothing from those tickets belongs in this file —
 * this screen exists to prove the dev client launches, the bundle loads, and
 * the palette is wired.
 */
export default function Index() {
  const missing = missingEnv();

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.mark}>CAIRN</Text>
        <Text style={styles.title}>
          Notes left at places, for whoever stands there next.
        </Text>

        {missing.length === 0 ? (
          <Text style={styles.ok}>ENVIRONMENT OK</Text>
        ) : (
          <View style={styles.missingBlock}>
            <Text style={styles.missingHeading}>MISSING ENVIRONMENT</Text>
            {missing.map((key) => (
              <Text key={key} style={styles.missingKey}>
                {key}
              </Text>
            ))}
            <Text style={styles.hint}>
              Copy .env.example to .env, fill it in, then restart Metro with
              --clear.
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.footer}>CRN-001 · SCAFFOLD</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    gap: space.lg,
  },
  mark: {
    ...type.mono,
    color: colors.accent,
  },
  title: {
    ...type.title,
    color: colors.text,
  },
  ok: {
    ...type.mono,
    color: colors.accent,
  },
  missingBlock: {
    gap: space.xs,
    borderLeftWidth: 2,
    borderLeftColor: colors.unresolved,
    paddingLeft: space.md,
  },
  missingHeading: {
    ...type.mono,
    color: colors.unresolved,
  },
  missingKey: {
    ...type.mono,
    color: colors.text,
  },
  hint: {
    ...type.mono,
    color: colors.textMuted,
    marginTop: space.sm,
  },
  footer: {
    ...type.mono,
    color: colors.textFaint,
    textAlign: 'center',
    paddingBottom: space.lg,
  },
});
