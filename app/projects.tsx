/**
 * Screen 12 — PROJECTS. "Projects" in the UI are `spaces` in the schema.
 *
 * Reads member spaces straight off `from('spaces').select()` — the
 * "spaces select mine" policy (0004) scopes the rows server-side, so an empty
 * array means "no memberships", not "query broken". Stone/member counts are
 * NOT client-queryable (default-deny on stones and space_members beyond the
 * caller's own rows), so the card's second line carries the join code instead
 * of fake counts.
 *
 * Join-by-code goes through the `join_space_by_code` RPC — deliberately not a
 * `where join_code = $1` select, which no policy allows (and never will).
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ensureSession, getSupabase } from '../src/lib/supabase';
import { colors, fonts, s, type } from '../src/theme';
import { MonoLabel, Screen } from '../src/ui';

/** The columns 0001_schema.sql defines on `public.spaces` that this screen reads. */
interface SpaceRow {
  id: string;
  name: string;
  accent_hex: string;
  join_code: string;
  created_at: string;
}

type LoadState = 'loading' | 'ready' | 'error';

/** `K74TQX` → `K7-4TQX`-style split per the wireframe's `K7-4TQ`. */
function formatJoinCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 2)}-${code.slice(2)}` : code;
}

export default function ProjectsScreen() {
  const router = useRouter();
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [load, setLoad] = useState<LoadState>('loading');
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const fetchSpaces = useCallback(async () => {
    await ensureSession();
    const { data, error } = await getSupabase()
      .from('spaces')
      .select('id, name, accent_hex, join_code, created_at')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as SpaceRow[];
  }, []);

  useEffect(() => {
    let alive = true;
    fetchSpaces()
      .then((rows) => {
        if (!alive) return;
        setSpaces(rows);
        setLoad('ready');
      })
      .catch(() => {
        if (alive) setLoad('error');
      });
    return () => {
      alive = false;
    };
  }, [fetchSpaces]);

  const submitJoin = useCallback(async () => {
    if (joining) return;
    const cleaned = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (cleaned.length !== 6) {
      setJoinError('CODE IS 6 CHARACTERS');
      return;
    }
    setJoining(true);
    setJoinError(null);
    try {
      const { error } = await getSupabase().rpc('join_space_by_code', { p_code: cleaned });
      if (error) throw error;
      setCode('');
      setSpaces(await fetchSpaces());
      setLoad('ready');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setJoinError(message.toLowerCase().includes('space not found') ? 'NO SPACE WITH THAT CODE' : 'JOIN FAILED · TRY AGAIN');
    } finally {
      setJoining(false);
    }
  }, [code, fetchSpaces, joining]);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Projects</Text>
        <Pressable onPress={() => router.push('/project-new')} hitSlop={12}>
          <MonoLabel color={colors.accent}>+ NEW</MonoLabel>
        </Pressable>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {load === 'loading' ? (
          <MonoLabel size="sm" color={colors.textFaint}>
            LOADING PROJECTS…
          </MonoLabel>
        ) : load === 'error' ? (
          <MonoLabel size="sm" color={colors.textFaint}>
            COULD NOT LOAD PROJECTS
          </MonoLabel>
        ) : spaces.length === 0 ? (
          <Text style={[type.small, { color: colors.textMuted }]}>No projects yet.</Text>
        ) : (
          spaces.map((space, index) => {
            const active = index === 0;
            return (
              <Pressable
                key={space.id}
                style={({ pressed }) => [
                  styles.card,
                  active && { borderColor: colors.accent50 },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={styles.cardTop}>
                  <View
                    style={[
                      styles.bullet,
                      { backgroundColor: active ? colors.accent : colors.contour },
                    ]}
                  />
                  <Text style={styles.cardName} numberOfLines={1}>
                    {space.name}
                  </Text>
                  {active ? (
                    <MonoLabel size="xs" color={colors.accent}>
                      ACTIVE
                    </MonoLabel>
                  ) : null}
                </View>
                <MonoLabel size="sm" color={colors.textFaint} style={styles.cardMeta}>
                  {`TEAM · CODE ${formatJoinCode(space.join_code)}`}
                </MonoLabel>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {joinError ? (
        <MonoLabel size="sm" color={colors.accent} style={styles.joinError}>
          {joinError}
        </MonoLabel>
      ) : null}

      <View style={styles.footer}>
        <MonoLabel size="sm" color={colors.textFaint}>
          JOIN BY CODE
        </MonoLabel>
        <View style={styles.joinRight}>
          <TextInput
            value={code}
            onChangeText={(text) => {
              setCode(text.toUpperCase());
              if (joinError) setJoinError(null);
            }}
            onSubmitEditing={() => void submitJoin()}
            placeholder="K7-4TQ"
            placeholderTextColor={colors.t25}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            returnKeyType="go"
            selectionColor={colors.accent}
            style={styles.joinInput}
          />
          <Pressable onPress={() => void submitJoin()} hitSlop={12} disabled={joining}>
            <MonoLabel size="sm" color={colors.accent}>
              {joining ? '…' : 'JOIN'}
            </MonoLabel>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  title: { fontSize: 24, fontWeight: '600', color: colors.text },
  list: { flex: 1, marginTop: 24 },
  listContent: { gap: 12, paddingBottom: 16 },
  card: {
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: s.pad,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bullet: { width: 9, height: 9 },
  cardName: { flex: 1, fontSize: 16, fontWeight: '500', color: colors.text },
  cardMeta: { marginTop: 8 },
  joinError: { textAlign: 'right', marginBottom: 8 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingTop: 16,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  joinRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  joinInput: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 1.6,
    color: colors.accent,
    minWidth: 84,
    textAlign: 'right',
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
});
