/**
 * The map screen.
 *
 * Apple Maps via react-native-maps, chosen so this runs in Expo Go with no
 * token and no native build. Map styling is deliberately abandoned for now —
 * the contour look is a later problem. This screen's job is: show where the
 * cairns are, show where you are, and open one when you tap it.
 *
 * The two rules that survive from the Mapbox version, because they are
 * architecture and not aesthetics:
 *   - Every RPC goes through src/lib/cairnApi.ts. Never call supabase.rpc here.
 *   - Position comes from the single watch in src/lib/usePosition.ts, so demo
 *     mode (CRN-025) can override one thing and have everything follow.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  fetchNearbyCairns,
  isCairnApiError,
  type CairnSummary,
} from '../src/lib/cairnApi';
import { usePosition } from '../src/lib/usePosition';
import { colors, space, type } from '../src/theme';

/** Technology Park, Ljubljana. Where the demo route lives. */
const TECHNOLOGY_PARK: Region = {
  latitude: 46.047,
  longitude: 14.472,
  latitudeDelta: 0.008,
  longitudeDelta: 0.008,
};

/**
 * Refetch only after the user has actually moved. A GPS watch fires far more
 * often than the cairn set changes, and one RPC per tick would flatten the
 * battery we are demoing on.
 */
const REFETCH_AFTER_M = 25;

/** Rough metres between two coordinates. Only used to decide when to refetch. */
function metresBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Stone count drives how a cairn reads at a glance — one contribution is a
 * pebble, a dozen is a landmark. Size only; the stacked-stone artwork is gone
 * with Mapbox and is not worth rebuilding before the capture flow works.
 */
function glyphSize(stoneCount: number): number {
  if (stoneCount >= 12) return 30;
  if (stoneCount >= 7) return 26;
  if (stoneCount >= 4) return 22;
  if (stoneCount >= 2) return 18;
  return 14;
}

export default function MapScreen() {
  const { coords, status, error: positionError } = usePosition();
  const [cairns, setCairns] = useState<CairnSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /** Where we last ran the nearby query, so we can throttle by distance. */
  const lastFetchAt = useRef<{ latitude: number; longitude: number } | null>(null);
  const mapRef = useRef<MapView>(null);
  const hasFramedUser = useRef(false);

  const load = useCallback(async (at: { latitude: number; longitude: number }) => {
    setLoading(true);
    try {
      const rows = await fetchNearbyCairns({ latitude: at.latitude, longitude: at.longitude });
      setCairns(rows);
      setLoadError(null);
      lastFetchAt.current = at;
    } catch (err) {
      setLoadError(
        isCairnApiError(err) ? err.message : 'Could not reach the cairns just now.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on first fix, then only after real movement.
  useEffect(() => {
    if (!coords) return;
    const here = { latitude: coords.latitude, longitude: coords.longitude };
    const prev = lastFetchAt.current;
    if (!prev || metresBetween(prev, here) >= REFETCH_AFTER_M) {
      void load(here);
    }
  }, [coords, load]);

  // Frame the user once, the first time we know where they are.
  useEffect(() => {
    if (!coords || hasFramedUser.current) return;
    hasFramedUser.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.006,
        longitudeDelta: 0.006,
      },
      600,
    );
  }, [coords]);

  const statusLine = useMemo(() => {
    if (status === 'denied') {
      return 'Location is off. Cairn only works where you are standing.';
    }
    if (status === 'unavailable') return 'No position yet. Step outside if you can.';
    if (status === 'requesting' || !coords) return 'Finding you…';
    if (loadError) return loadError;
    if (cairns.length === 0) return 'No cairns nearby. Drop the first one.';
    return `${cairns.length} ${cairns.length === 1 ? 'cairn' : 'cairns'} nearby`;
  }, [status, coords, loadError, cairns.length, positionError]);

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={TECHNOLOGY_PARK}
        showsUserLocation
        showsMyLocationButton={false}
        showsPointsOfInterest={false}
        showsBuildings={false}
        showsTraffic={false}
        userInterfaceStyle="dark"
        toolbarEnabled={false}
      >
        {cairns.map((cairn) => {
          const size = glyphSize(cairn.stone_count);
          return (
            <Marker
              key={cairn.id}
              coordinate={{ latitude: cairn.lat, longitude: cairn.lng }}
              title={cairn.title ?? 'Cairn'}
              description={`${cairn.stone_count} ${
                cairn.stone_count === 1 ? 'stone' : 'stones'
              } · ${cairn.distance_m} m`}
              tracksViewChanges={false}
            >
              <View
                style={[
                  styles.glyph,
                  {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: cairn.accent_hex ?? colors.accent,
                  },
                ]}
              />
            </Marker>
          );
        })}
      </MapView>

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.statusBar}>
          <Text style={styles.status}>{statusLine.toUpperCase()}</Text>
          {loading ? <ActivityIndicator size="small" color={colors.accent} /> : null}
        </View>

        <View style={styles.spacer} pointerEvents="none" />

        <Pressable
          style={styles.dropButton}
          onPress={() => {
            // CRN-009 lands here: drop a cairn at the current position.
          }}
          disabled={!coords}
        >
          <Text style={styles.dropLabel}>
            {coords ? 'LEAVE SOMETHING HERE' : 'WAITING FOR POSITION'}
          </Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  overlay: { flex: 1, justifyContent: 'space-between' },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    margin: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 4,
    backgroundColor: 'rgba(15, 30, 23, 0.88)',
  },
  status: { ...type.mono, color: colors.text, flexShrink: 1 },
  spacer: { flex: 1 },
  glyph: { borderWidth: 1, borderColor: colors.background },
  dropButton: {
    margin: space.md,
    paddingVertical: space.md,
    alignItems: 'center',
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  dropLabel: { ...type.mono, color: colors.background },
});
