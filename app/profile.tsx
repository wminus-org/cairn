/**
 * Profile — the sheet behind the map avatar. One editable field (display name,
 * CRN-004), and the two ways off it: Projects and Settings. Sign-out lives on
 * Settings; this screen doesn't duplicate it.
 *
 * `setDisplayName` writes `profiles.display_name`. If the self-update policy on
 * `public.profiles` hasn't shipped the update matches zero rows and throws — we
 * surface that as a mono notice rather than a redbox, and the name the thread
 * shows falls back to the trigger's default.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { setDisplayName } from '../src/lib/supabase';
import { colors, s } from '../src/theme';
import { Avatar, ChevronIcon, MonoLabel, Row, Screen } from '../src/ui';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function ProfileScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [state, setState] = useState<SaveState>('idle');

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || state === 'saving') return;
    setState('saving');
    try {
      await setDisplayName(trimmed);
      setState('saved');
    } catch {
      setState('error');
    }
  };

  const initial = name.trim().charAt(0) || 'W';

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <MonoLabel color={colors.textMuted}>‹ MAP</MonoLabel>
        </Pressable>
      </View>

      <View style={styles.identity}>
        <Avatar initial={initial} size={64} />
        <Text style={styles.who}>Walker</Text>
        <MonoLabel size="xs" color={colors.t40}>
          ANONYMOUS SESSION
        </MonoLabel>
      </View>

      <MonoLabel size="sm" color={colors.t45} style={styles.label}>
        DISPLAY NAME
      </MonoLabel>
      <View style={styles.nameRow}>
        <TextInput
          value={name}
          onChangeText={(t) => {
            setName(t);
            if (state !== 'idle') setState('idle');
          }}
          onSubmitEditing={() => void save()}
          placeholder="How your notes are signed"
          placeholderTextColor={colors.t25}
          selectionColor={colors.accent}
          returnKeyType="done"
          style={styles.nameInput}
        />
        <Pressable onPress={() => void save()} hitSlop={12} disabled={!name.trim()}>
          <MonoLabel size="sm" color={name.trim() ? colors.accent : colors.t25}>
            {state === 'saving' ? '…' : 'SAVE'}
          </MonoLabel>
        </Pressable>
      </View>
      {state === 'saved' ? (
        <MonoLabel size="xs" color={colors.accent} style={styles.notice}>
          SAVED
        </MonoLabel>
      ) : state === 'error' ? (
        <MonoLabel size="xs" color={colors.alert} style={styles.notice}>
          NAME UPDATE NOT AVAILABLE YET
        </MonoLabel>
      ) : null}

      <View style={styles.links}>
        <Row title="Projects" onPress={() => router.push('/projects')} right={<ChevronIcon />} />
        <Row title="Settings" onPress={() => router.push('/settings')} right={<ChevronIcon />} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: 12 },
  identity: { alignItems: 'center', gap: 10, marginTop: 24 },
  who: { fontSize: 22, fontWeight: '600', color: colors.text, marginTop: 4 },
  label: { marginTop: 40 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.t35,
  },
  nameInput: { flex: 1, paddingVertical: 12, fontSize: 17, color: colors.text },
  notice: { marginTop: 10 },
  links: { marginTop: s.gutter },
});
