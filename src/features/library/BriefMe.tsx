/**
 * "Brief me" — the moment that wins the room (CRN-023). One press speaks ~25s
 * of synthesis, hands-free, and shows the same text under the button as the
 * stage fallback DEMO.md § Cairn 3 depends on.
 *
 * UI scope only: this reads the CACHED briefing that `cairn_detail` already
 * returned (`detail.briefing.summary_text`, written by the seed script CRN-027)
 * and speaks it with on-device TTS. When no cached briefing exists it invokes
 * the `brief` Edge Function if it is deployed, and otherwise says so plainly —
 * the gate and the generation live server-side, never in this component.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Speech from 'expo-speech';

import { isUnlocked, type CairnDetail } from '../../lib/cairnApi';
import { getSupabase } from '../../lib/supabase';
import { colors, fonts, type } from '../../theme';
import { MonoLabel } from '../../ui';
import { enablePlaybackAudio } from './playbackAudio';

/** ~150 wpm spoken, so 60 words ≈ 25s. Trim to a sentence past ~70 words. */
function clampSpoken(text: string): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= 70) return text.trim();
  const cut = words.slice(0, 70).join(' ');
  const lastStop = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
  return lastStop > 0 ? cut.slice(0, lastStop + 1) : `${cut}…`;
}

export function BriefMe({ detail }: { detail: CairnDetail }) {
  const [summary, setSummary] = useState<string | null>(detail.briefing?.summary_text ?? null);
  const [speaking, setSpeaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      Speech.stop();
    };
  }, []);

  // Only offered when the server released the cairn and it has enough history.
  if (!isUnlocked(detail) || detail.stone_count < 3) return null;

  const speak = (text: string) => {
    enablePlaybackAudio();
    setSpeaking(true);
    Speech.stop();
    const stopSpeaking = () => {
      if (alive.current) setSpeaking(false);
    };
    Speech.speak(clampSpoken(text), {
      rate: 0.96,
      onDone: stopSpeaking,
      onStopped: stopSpeaking,
      onError: stopSpeaking,
    });
  };

  const onPress = async () => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    // Cached path — instant, the stage press.
    if (summary) {
      speak(summary);
      return;
    }
    // No cached briefing: ask the server to make one. Absent Edge Function is a
    // deploy gap, not a crash — say so and leave the button usable.
    setBusy(true);
    setNote(null);
    try {
      const { data, error } = await getSupabase().functions.invoke('brief', {
        body: { cairn_id: detail.id, lat: detail.lat, lng: detail.lng },
      });
      if (error) throw error;
      const text = (data as { briefing?: string; summary_text?: string })?.briefing
        ?? (data as { summary_text?: string })?.summary_text
        ?? null;
      if (!alive.current) return;
      if (text) {
        setSummary(text);
        speak(text);
      } else {
        setNote('NO BRIEFING RETURNED');
      }
    } catch {
      if (alive.current) setNote('BRIEFING NOT AVAILABLE YET');
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => void onPress()}
        disabled={busy}
        style={({ pressed }) => [
          styles.button,
          speaking && { borderColor: colors.accent, backgroundColor: colors.accent12 },
          pressed && { opacity: 0.7 },
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <>
            {speaking ? <View style={styles.pulse} /> : null}
            <Text style={[type.mono, styles.label, { color: colors.accent, fontFamily: fonts.monoBold }]}>
              {speaking ? 'SPEAKING · TAP TO STOP' : 'BRIEF ME'}
            </Text>
          </>
        )}
      </Pressable>

      {summary ? (
        <Text style={styles.summary}>{summary}</Text>
      ) : note ? (
        <MonoLabel size="xs" color={colors.t40} style={styles.noteLine}>
          {note}
        </MonoLabel>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  button: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.accent50,
    paddingVertical: 16,
  },
  label: { fontSize: 12 },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  summary: {
    ...type.small,
    color: colors.t60,
    marginTop: 14,
  },
  noteLine: { marginTop: 12 },
});
