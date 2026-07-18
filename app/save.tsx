/**
 * 07 · SAVE — name the note and leave it (CRN-011 upload + CRN-017 stack).
 *
 * The honest shape of the write path today: `stack_stone` adds a voice stone to
 * an EXISTING cairn the caller is standing inside, and that is wired here. There
 * is no `drop_cairn` RPC yet (CRN-009 is todo), so a recording with no cairn in
 * range cannot mint one — the SAVE button says so plainly rather than 403-ing on
 * stage, the same stance app/project-new.tsx takes on the missing spaces insert.
 */
import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatClock } from '../src/features/library/distance';
import { useSettings } from '../src/features/manage/settingsStore';
import {
  fetchNearbyCairns,
  isCairnApiError,
  stackStone,
  type CairnSummary,
} from '../src/lib/cairnApi';
import { storageKeys, uploadToBucket } from '../src/lib/supabase';
import { usePosition } from '../src/lib/usePosition';
import { colors, fonts, type } from '../src/theme';
import { Btn, MonoLabel, Screen, SectionHeader, SerifTitle } from '../src/ui';

type NoteVisibility = 'PUBLIC' | 'TEAM' | 'PRIVATE';
const VISIBILITIES: readonly NoteVisibility[] = ['PUBLIC', 'TEAM', 'PRIVATE'];

type SaveState = 'idle' | 'saving' | 'done';

export default function SaveScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ uri?: string; durationSec?: string }>();
  const { coords } = usePosition();
  const { settings } = useSettings();

  const uri = params.uri ?? null;
  const durationSec = Number(params.durationSec ?? 0) || 0;

  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<NoteVisibility>(settings.defaultVisibility);
  const [target, setTarget] = useState<CairnSummary | null>(null);
  const [resolving, setResolving] = useState(true);
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  // Find the nearest cairn we are actually standing inside — the one we can add to.
  useEffect(() => {
    if (!coords) return;
    let alive = true;
    setResolving(true);
    fetchNearbyCairns(coords)
      .then((rows) => {
        if (!alive) return;
        const inRange = rows
          .filter((c) => c.distance_m <= c.radius_m)
          .sort((a, b) => a.distance_m - b.distance_m)[0];
        setTarget(inRange ?? null);
      })
      .catch(() => alive && setTarget(null))
      .finally(() => alive && setResolving(false));
    return () => {
      alive = false;
    };
  }, [coords]);

  const save = useCallback(async () => {
    if (!uri || !coords || !target || state === 'saving') return;
    setState('saving');
    setError(null);
    try {
      const stoneId = randomUUID();
      const key = storageKeys.stoneAudio(target.id, stoneId);
      const audioPath = await uploadToBucket(uri, 'cairn-audio', key, 'audio/mp4');
      await stackStone({
        cairnId: target.id,
        kind: 'voice',
        position: coords,
        audioPath,
        bodyText: title.trim() || null,
      });
      setState('done');
      router.replace(`/note/${target.id}`);
    } catch (err) {
      setState('idle');
      if (isCairnApiError(err) && err.kind === 'too-far') {
        setError('WALK BACK TO THE CAIRN');
      } else {
        setError('COULD NOT SAVE · TRY AGAIN');
      }
    }
  }, [uri, coords, target, title, state, router]);

  const canSave = !!uri && !!target && state !== 'saving';

  return (
    <Screen deep>
      <Pressable onPress={() => router.replace('/map')} hitSlop={12} style={styles.cancel}>
        <MonoLabel color={colors.textMuted}>✕ DISCARD</MonoLabel>
      </Pressable>

      <SerifTitle style={styles.heading}>Name this note</SerifTitle>
      <MonoLabel size="sm" color={colors.accent} style={styles.dur}>
        {`VOICE · ${formatClock(durationSec)}`}
      </MonoLabel>

      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Valve on the north wall"
        placeholderTextColor={colors.t25}
        selectionColor={colors.accent}
        style={styles.titleInput}
      />

      <SectionHeader label="VISIBILITY" />
      <View style={styles.segments}>
        {VISIBILITIES.map((option) => {
          const selected = option === visibility;
          return (
            <Pressable
              key={option}
              onPress={() => setVisibility(option)}
              style={[styles.segment, selected ? styles.segmentSelected : styles.segmentIdle]}
            >
              <Text
                style={[
                  type.mono,
                  selected
                    ? { color: colors.backgroundDeep, fontFamily: fonts.monoBold }
                    : { color: colors.t60 },
                ]}
              >
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.spacer} />

      {error ? (
        <MonoLabel size="sm" color={colors.alert} style={styles.notice}>
          {error}
        </MonoLabel>
      ) : resolving ? (
        <MonoLabel size="xs" color={colors.t40} style={styles.notice}>
          FINDING THE CAIRN YOU'RE STANDING ON…
        </MonoLabel>
      ) : target ? (
        <MonoLabel size="xs" color={colors.t45} style={styles.notice}>
          {`STACKING ONTO ${(target.title ?? 'UNTITLED CAIRN').toUpperCase()}`}
        </MonoLabel>
      ) : (
        <MonoLabel size="xs" color={colors.t40} style={styles.notice}>
          NO CAIRN HERE · DROPPING A NEW ONE LANDS WITH THE NEXT MIGRATION
        </MonoLabel>
      )}

      <Btn
        label={state === 'saving' ? 'SAVING…' : 'SAVE NOTE'}
        variant="accent"
        onPress={() => void save()}
        disabled={!canSave}
        style={!canSave ? styles.disabled : undefined}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cancel: { alignSelf: 'flex-start', marginTop: 16 },
  heading: { marginTop: 32 },
  dur: { marginTop: 12 },
  titleInput: {
    marginTop: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.t35,
    fontSize: 19,
    color: colors.text,
  },
  segments: { flexDirection: 'row', gap: 2, marginTop: 12 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 13 },
  segmentSelected: { backgroundColor: colors.contour },
  segmentIdle: { borderWidth: 1, borderColor: colors.t25 },
  spacer: { flex: 1 },
  notice: { textAlign: 'center', marginBottom: 12 },
  disabled: { opacity: 0.5 },
});
