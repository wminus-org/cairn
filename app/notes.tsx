/**
 * Nearby — CRN-024. A distance-sorted list of cairns, grouped by Space then
 * Personal, contents hidden. Same server gate, same distance numbers, ZERO
 * Mapbox: this is the surface you pitch from if the map renders a grey
 * rectangle at 16:10. Nothing in this file's import graph touches react-native-maps.
 *
 * "Contents hidden" is literal — a row shows a glyph, a title, and how far away
 * it is. No waveform, no thumbnail, no snippet. Blur belongs to the map.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatDistance, metresBetween } from '../src/features/library/distance';
import { fetchNearbyCairns, type CairnSummary } from '../src/lib/cairnApi';
import { ensureSession, getSupabase } from '../src/lib/supabase';
import { usePosition } from '../src/lib/usePosition';
import { colors, s, type } from '../src/theme';
import { BottomNav, CairnGlyph, MonoLabel } from '../src/ui';

interface Section {
  title: string;
  accent: string | null;
  data: CairnSummary[];
}

/** space_id → { name, accent }. Personal cairns (null space) fall through. */
async function fetchSpaceNames(): Promise<Record<string, { name: string; accent: string }>> {
  try {
    await ensureSession();
    const { data } = await getSupabase().from('spaces').select('id, name, accent_hex');
    const out: Record<string, { name: string; accent: string }> = {};
    for (const row of (data ?? []) as { id: string; name: string; accent_hex: string }[]) {
      out[row.id] = { name: row.name, accent: row.accent_hex };
    }
    return out;
  } catch {
    return {};
  }
}

function group(
  cairns: CairnSummary[],
  spaces: Record<string, { name: string; accent: string }>,
): Section[] {
  const bySpace = new Map<string | null, CairnSummary[]>();
  for (const cairn of cairns) {
    const key = cairn.space_id ?? null;
    const list = bySpace.get(key) ?? [];
    list.push(cairn);
    bySpace.set(key, list);
  }
  const sections: Section[] = [];
  // Space sections first — the B2B story is the first thing on screen.
  for (const [key, list] of bySpace) {
    if (key === null) continue;
    list.sort((a, b) => a.distance_m - b.distance_m);
    sections.push({ title: spaces[key]?.name ?? 'Space', accent: spaces[key]?.accent ?? colors.accent, data: list });
  }
  const personal = bySpace.get(null);
  if (personal) {
    personal.sort((a, b) => a.distance_m - b.distance_m);
    sections.push({ title: 'Personal', accent: null, data: personal });
  }
  return sections;
}

export default function NearbyScreen() {
  const router = useRouter();
  const { coords, status } = usePosition();
  const [sections, setSections] = useState<Section[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const lastAt = useRef<{ latitude: number; longitude: number } | null>(null);

  const load = useCallback(async () => {
    // No fix → unsorted list, "—" distances. A fallback that needs GPS is not one.
    const position = coords ?? { latitude: 0, longitude: 0 };
    const [rows, spaces] = await Promise.all([
      fetchNearbyCairns(position).catch(() => [] as CairnSummary[]),
      fetchSpaceNames(),
    ]);
    setSections(group(rows, spaces));
    setLoaded(true);
    lastAt.current = coords ?? null;
  }, [coords]);

  // Refetch on focus, and when the user has actually moved ≥10m — recomputing
  // on every 1Hz tick swaps rows under the thumb.
  useFocusEffect(
    useCallback(() => {
      const prev = lastAt.current;
      if (!loaded || !prev || !coords || metresBetween(prev, coords) >= 10) void load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  const distanceOf = (cairn: CairnSummary) => {
    if (!coords || status === 'denied') return { label: '—', here: false };
    if (cairn.distance_m <= cairn.radius_m) return { label: 'HERE', here: true };
    return { label: formatDistance(cairn.distance_m), here: false };
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <Text style={styles.title}>Nearby</Text>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <View style={[styles.swatch, { backgroundColor: section.accent ?? colors.accent }]} />
            <MonoLabel size="sm" color={colors.t45}>
              {section.title.toUpperCase()}
            </MonoLabel>
          </View>
        )}
        renderItem={({ item, section }) => {
          const d = distanceOf(item);
          return (
            <Pressable
              onPress={() => router.push(`/note/${item.id}`)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
            >
              <View style={styles.glyph}>
                <CairnGlyph
                  count={item.stone_count}
                  color={section.accent ?? undefined}
                  here={d.here}
                  scale={1}
                />
              </View>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.title ?? 'Untitled cairn'}
              </Text>
              <MonoLabel size="sm" color={d.here ? colors.accent : colors.t40}>
                {d.label}
              </MonoLabel>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          loaded ? (
            <Text style={styles.empty}>No cairns nearby. Walk somewhere and leave the first.</Text>
          ) : null
        }
      />

      <BottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: s.gutter },
  title: { fontSize: 24, fontWeight: '600', color: colors.text, marginTop: 14, marginBottom: 8 },
  listContent: { paddingBottom: 24 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  swatch: { width: 8, height: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
  glyph: { width: 20, alignItems: 'center', justifyContent: 'flex-end' },
  rowTitle: { flex: 1, fontSize: 16, color: colors.text },
  empty: { ...type.small, color: colors.t60, marginTop: 40 },
});
