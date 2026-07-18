/**
 * 03 · PERMISSIONS — two bordered cards: LOCATION (required) and
 * MICROPHONE (optional). Location granted unlocks OPEN THE MAP.
 */
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, type } from '../src/theme';
import { Btn, MonoLabel, Screen, SerifTitle } from '../src/ui';

function Badge({
  label,
  solid,
  accent,
  onPress,
}: {
  label: string;
  /** Solid orange fill with dark bold mono — the ALLOW call to action. */
  solid: boolean;
  /** Outline badge tinted orange — the GRANTED state on the mic card. */
  accent?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={10}
      style={({ pressed }) => [
        styles.badge,
        solid
          ? { backgroundColor: colors.accent }
          : { borderWidth: 1, borderColor: accent ? colors.accent50 : colors.t35 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text
        style={[
          type.monoSmall,
          styles.badgeLabel,
          solid
            ? { color: colors.background, fontFamily: fonts.monoBold }
            : { color: accent ? colors.accent : colors.t60 },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function Permissions() {
  const router = useRouter();
  const [locationGranted, setLocationGranted] = useState(false);
  const [micGranted, setMicGranted] = useState(false);

  // Prefill from the OS so a returning user sees GRANTED, not ALLOW.
  useEffect(() => {
    let alive = true;
    Location.getForegroundPermissionsAsync()
      .then(({ granted }) => {
        if (alive && granted) setLocationGranted(true);
      })
      .catch(() => {});
    getRecordingPermissionsAsync()
      .then(({ granted }) => {
        if (alive && granted) setMicGranted(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const askLocation = async () => {
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (granted) setLocationGranted(true);
    } catch {
      // Denied or unavailable — the badge stays ALLOW, user can retry.
    }
  };

  const askMic = async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (granted) setMicGranted(true);
    } catch {
      // Optional anyway.
    }
  };

  return (
    <Screen padded={false} style={styles.screen}>
      <SerifTitle size={40}>Two things{'\n'}we need</SerifTitle>

      <View style={styles.cards}>
        <View style={[styles.card, { borderColor: colors.accent50 }]}>
          <View style={styles.cardHeader}>
            <MonoLabel color={colors.accent} style={styles.cardLabel}>
              01 · LOCATION
            </MonoLabel>
            <Badge
              label={locationGranted ? 'GRANTED' : 'ALLOW'}
              solid
              onPress={locationGranted ? undefined : askLocation}
            />
          </View>
          <Text style={styles.cardCopy}>
            Notes are pinned to where you stand. No location, no Cairn.
          </Text>
        </View>

        <View
          style={[styles.card, { borderColor: micGranted ? colors.accent50 : colors.t18 }]}
        >
          <View style={styles.cardHeader}>
            <MonoLabel color={colors.contour} style={styles.cardLabel}>
              02 · MICROPHONE
            </MonoLabel>
            <Badge
              label={micGranted ? 'GRANTED' : 'NEXT'}
              solid={false}
              accent={micGranted}
              onPress={micGranted ? undefined : askMic}
            />
          </View>
          <Text style={styles.cardCopy}>
            Your voice is the input. Transcription happens on-device.
          </Text>
        </View>
      </View>

      <View style={styles.bottom}>
        {locationGranted ? (
          <Btn label="OPEN THE MAP" variant="accent" onPress={() => router.replace('/map')} />
        ) : null}
        <MonoLabel size="sm" color={colors.t40} style={styles.footer}>
          WHILE USING THE APP ONLY · CHANGE ANYTIME
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
  cards: {
    marginTop: 36,
    gap: 14,
  },
  card: {
    borderWidth: 1,
    padding: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: {
    letterSpacing: 1.76,
  },
  cardCopy: {
    ...type.small,
    fontSize: 13,
    lineHeight: 21,
    color: colors.t60,
    marginTop: 12,
  },
  bottom: {
    marginTop: 'auto',
    gap: 20,
  },
  badge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  badgeLabel: {
    letterSpacing: 1.2,
  },
  footer: {
    textAlign: 'center',
    letterSpacing: 1.4,
  },
});
