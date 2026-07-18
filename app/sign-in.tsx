/**
 * 02 · SIGN IN — serif headline, sub-copy, three square auth buttons.
 * Hackathon reality: every button resolves the anonymous Supabase session
 * via ensureSession() and moves on to /permissions.
 */
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ensureSession } from '../src/lib/supabase';
import { colors, type } from '../src/theme';
import { Btn, MonoLabel, Screen, SerifTitle } from '../src/ui';

export default function SignIn() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const continueAnon = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await ensureSession();
      if (alive.current) router.push('/permissions');
    } catch {
      // Session will be retried from the permissions screen's owner; stay put.
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <Screen padded={false} style={styles.screen}>
      <SerifTitle size={44}>Leave a note{'\n'}where it happened</SerifTitle>
      <Text style={styles.subcopy}>
        Speak at a spot. Anyone who stands there later can hear it.
      </Text>

      <View style={styles.bottom}>
        <Btn label=" CONTINUE WITH APPLE" variant="ink" onPress={continueAnon} disabled={busy} />
        <Btn label="G · CONTINUE WITH GOOGLE" variant="outline" onPress={continueAnon} disabled={busy} />
        <Btn label="@ · EMAIL" variant="outline" onPress={continueAnon} disabled={busy} />
        <MonoLabel size="sm" color={colors.t40} style={styles.footer}>
          TERMS · PRIVACY
        </MonoLabel>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 80,
    paddingHorizontal: 26,
    paddingBottom: 48,
  },
  subcopy: {
    ...type.body,
    fontSize: 15,
    lineHeight: 24,
    color: colors.t60,
    marginTop: 18,
  },
  bottom: {
    marginTop: 'auto',
    gap: 12,
  },
  footer: {
    textAlign: 'center',
    marginTop: 8,
    letterSpacing: 1.2,
  },
});
