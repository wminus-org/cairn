/**
 * 01 · SPLASH — three stacked bars, the serif wordmark, a mono tagline.
 * Kicks off the anonymous session, then routes on the location permission:
 * granted → /map, otherwise → /sign-in.
 */
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { ensureSession } from '../src/lib/supabase';
import { colors, s } from '../src/theme';
import { MonoLabel, Screen, SerifTitle } from '../src/ui';

const SPLASH_HOLD_MS = 1200;

export default function Splash() {
  const router = useRouter();

  useEffect(() => {
    let alive = true;

    // Warm the anonymous session while the wordmark holds. Fire and forget —
    // sign-in / permissions will await their own call if this one loses.
    ensureSession().catch(() => {});

    const timer = setTimeout(() => {
      Location.getForegroundPermissionsAsync()
        .then(({ granted }) => {
          if (!alive) return;
          router.replace(granted ? '/map' : '/sign-in');
        })
        .catch(() => {
          if (!alive) return;
          router.replace('/sign-in');
        });
    }, SPLASH_HOLD_MS);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <Screen style={styles.screen}>
      <View style={styles.glyph}>
        <View style={[styles.bar, { width: 14 }]} />
        <View style={[styles.bar, { width: 22 }]} />
        <View style={[styles.bar, { width: 30, backgroundColor: colors.accent }]} />
      </View>
      <SerifTitle size={56} style={styles.wordmark}>
        Cairn
      </SerifTitle>
      <MonoLabel color={colors.t45} style={styles.tagline}>
        VOICE NOTES, LEFT IN PLACE
      </MonoLabel>
      <MonoLabel size="sm" color={colors.t35} style={styles.build}>
        V 0.1 · BUILD 42
      </MonoLabel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  glyph: {
    alignItems: 'center',
    gap: 4,
  },
  bar: {
    height: s.unit,
    backgroundColor: colors.contour,
  },
  wordmark: {
    lineHeight: 62,
  },
  tagline: {
    letterSpacing: 2.4,
  },
  build: {
    position: 'absolute',
    bottom: 60,
  },
});
