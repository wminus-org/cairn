/**
 * Screen 14 — SETTINGS. Every value persists locally through
 * src/features/manage/settingsStore.ts (single `cairn.settings` blob; the
 * "Ask for name & category" toggle also mirrors into `cairn.skipSavePrompt`
 * for the capture flow). Nothing here touches the network except SIGN OUT.
 */
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  cycleNext,
  MAX_LENGTH_ORDER,
  useSettings,
  VISIBILITY_ORDER,
} from '../src/features/manage/settingsStore';
import { getSupabase } from '../src/lib/supabase';
import { colors } from '../src/theme';
import { MonoLabel, Row, Screen, SectionHeader, SquareToggle } from '../src/ui';

export default function SettingsScreen() {
  const router = useRouter();
  const { settings, update } = useSettings();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await getSupabase().auth.signOut();
    } catch {
      // A dead network must not trap the user on this screen; the local
      // session is cleared either way on the next bootstrap.
    } finally {
      router.replace('/sign-in');
    }
  }, [router, signingOut]);

  return (
    <Screen>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Settings</Text>

        <SectionHeader label="RECORDING" />
        <Row
          title="Ask for name & category"
          subtitle="POPUP AFTER EACH RECORDING"
          right={
            <SquareToggle
              value={settings.askForName}
              onChange={(value) => update({ askForName: value })}
            />
          }
        />
        <Row
          title="Default visibility"
          subtitle="FOR NEW NOTES"
          onPress={() =>
            update({ defaultVisibility: cycleNext(VISIBILITY_ORDER, settings.defaultVisibility) })
          }
          right={
            <MonoLabel size="sm" color={colors.text}>
              {`${settings.defaultVisibility} ▾`}
            </MonoLabel>
          }
        />
        <Row
          title="Max length"
          onPress={() => update({ maxLength: cycleNext(MAX_LENGTH_ORDER, settings.maxLength) })}
          right={
            <MonoLabel size="sm" color={colors.text}>
              {`${settings.maxLength} ▾`}
            </MonoLabel>
          }
        />

        <SectionHeader label="MAP" />
        <Row
          title="Heat map when zoomed out"
          right={
            <SquareToggle
              value={settings.heatMapWhenZoomedOut}
              onChange={(value) => update({ heatMapWhenZoomedOut: value })}
            />
          }
        />
        <Row
          title="Show public notes"
          right={
            <SquareToggle
              value={settings.showPublicNotes}
              onChange={(value) => update({ showPublicNotes: value })}
            />
          }
        />

        <SectionHeader label="AI" />
        <Row
          title="On-device transcription"
          subtitle="AUDIO NEVER LEAVES THE PHONE"
          right={
            <SquareToggle
              value={settings.onDeviceTranscription}
              onChange={(value) => update({ onDeviceTranscription: value })}
            />
          }
        />
      </ScrollView>

      <View style={styles.footer}>
        <MonoLabel size="sm" color={colors.t35}>
          CAIRN 0.1 ·{' '}
        </MonoLabel>
        <Pressable onPress={() => void signOut()} hitSlop={12} disabled={signingOut}>
          <MonoLabel size="sm" color={colors.t35}>
            {signingOut ? 'SIGNING OUT…' : 'SIGN OUT'}
          </MonoLabel>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  title: { fontSize: 24, fontWeight: '600', color: colors.text, marginTop: 14 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 14,
    paddingBottom: 6,
  },
});
