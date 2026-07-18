/**
 * The map screens — 04 MAP HOME and 05 ZOOMED OUT HEAT MAP from the wireframe.
 *
 * Apple Maps via react-native-maps (runs in Expo Go, no token). One screen,
 * two modes: zoomed in shows individual cairn dots and the location bar;
 * cross `HEAT_LAT_DELTA` and it swaps to clustered translucent orange heat
 * rings with "N NOTES" badges and a zoom control.
 *
 * The two rules that survive every redesign, because they are architecture:
 *   - Every RPC goes through src/lib/cairnApi.ts. Never call supabase.rpc here.
 *   - Position comes from the single watch in src/lib/usePosition.ts, so demo
 *     mode (CRN-025) can override one thing and have everything follow.
 * Plus the throttles: refetch only after ≥25m of movement, frame the user once.
 */
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { clusterCairns, type CairnCluster } from '../src/features/map/cluster';
import {
  fetchNearbyCairns,
  isCairnApiError,
  type CairnSummary,
} from '../src/lib/cairnApi';
import { usePosition } from '../src/lib/usePosition';
import { colors, s, type } from '../src/theme';
import { Avatar, BottomNav, MonoLabel, SquareToggle } from '../src/ui';

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

/** Past this latitude span the map stops being about individual notes. */
const HEAT_LAT_DELTA = 0.05;

/** Zoom control bounds — don't animate into the atom or out to the planet. */
const MIN_LAT_DELTA = 0.002;
const MAX_LAT_DELTA = 1.4;

/** Rough metres per degree of latitude, for sizing heat rings. */
const M_PER_LAT_DEG = 111_320;

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
 * Bone-dot diameter, scaled by stone count: one contribution is a pebble,
 * a dozen reads as a landmark. Wireframe range is 14–16px.
 */
function dotSize(stoneCount: number): number {
  if (stoneCount >= 7) return 16;
  if (stoneCount >= 3) return 15;
  return 14;
}

function dotOpacity(stoneCount: number): number {
  if (stoneCount >= 7) return 0.85;
  if (stoneCount >= 3) return 0.7;
  return 0.6;
}

/** Outer heat-ring radius in metres, proportional to viewport and note count. */
function heatRadiusM(cluster: CairnCluster, latitudeDelta: number): number {
  const viewportM = latitudeDelta * M_PER_LAT_DEG;
  const weight = Math.min(1, Math.sqrt(cluster.noteCount) / 6);
  return viewportM * (0.05 + 0.065 * weight);
}

export default function MapScreen() {
  const router = useRouter();
  const { coords, status } = usePosition();
  const [cairns, setCairns] = useState<CairnSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [region, setRegion] = useState<Region>(TECHNOLOGY_PARK);
  /** Visual-only for now: on = show public notes only. */
  const [publicOnly, setPublicOnly] = useState(true);
  const [placeName, setPlaceName] = useState<string | null>(null);

  /** Where we last ran the nearby query, so we can throttle by distance. */
  const lastFetchAt = useRef<{ latitude: number; longitude: number } | null>(null);
  const mapRef = useRef<MapView>(null);
  const hasFramedUser = useRef(false);
  const hasGeocoded = useRef(false);

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

  // Name the place once, off the first fix. Reverse geocoding is a network
  // call on iOS — one is plenty, and "Nearby" is a fine fallback forever.
  useEffect(() => {
    if (!coords || hasGeocoded.current) return;
    hasGeocoded.current = true;
    void (async () => {
      try {
        const results = await Location.reverseGeocodeAsync({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        const first = results[0];
        const name =
          first?.name ?? first?.street ?? first?.district ?? first?.city ?? null;
        if (name) setPlaceName(name);
      } catch {
        // Keep the fallback. A failed geocode is not worth a status line.
      }
    })();
  }, [coords]);

  const heatMode = region.latitudeDelta > HEAT_LAT_DELTA;

  const visibleCairns = useMemo(
    () => (publicOnly ? cairns.filter((c) => c.space_id === null) : cairns),
    [cairns, publicOnly],
  );

  // Server returns nearest-first; the head of the list is "your" cairn.
  const nearest = visibleCairns[0] ?? null;

  const clusters = useMemo(
    () =>
      heatMode ? clusterCairns(visibleCairns, region.latitudeDelta * 0.12) : [],
    [heatMode, visibleCairns, region.latitudeDelta],
  );

  const statusLine = useMemo(() => {
    if (status === 'denied') return 'Location off — Cairn works where you stand';
    if (status === 'unavailable') return 'No position yet — step outside';
    if (status === 'requesting' || !coords) return 'Finding you…';
    if (loadError) return loadError;
    if (visibleCairns.length === 0) return 'No notes nearby — drop the first';
    return 'Location';
  }, [status, coords, loadError, visibleCairns.length]);

  const zoomBy = useCallback(
    (factor: number) => {
      const latitudeDelta = Math.min(
        MAX_LAT_DELTA,
        Math.max(MIN_LAT_DELTA, region.latitudeDelta * factor),
      );
      const longitudeDelta =
        latitudeDelta * (region.longitudeDelta / region.latitudeDelta || 1);
      mapRef.current?.animateToRegion(
        { ...region, latitudeDelta, longitudeDelta },
        280,
      );
    },
    [region],
  );

  const openNote = useCallback(
    (id: string) => {
      router.push(`/note/${id}`);
    },
    [router],
  );

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={TECHNOLOGY_PARK}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        showsMyLocationButton={false}
        showsPointsOfInterest={false}
        showsBuildings={false}
        showsTraffic={false}
        showsCompass={false}
        userInterfaceStyle="dark"
        toolbarEnabled={false}
      >
        {/* 04 — individual cairns. */}
        {!heatMode &&
          visibleCairns.map((cairn) => {
            const mine = nearest !== null && cairn.id === nearest.id;
            if (mine) {
              return (
                <Marker
                  key={cairn.id}
                  coordinate={{ latitude: cairn.lat, longitude: cairn.lng }}
                  onPress={() => openNote(cairn.id)}
                  tracksViewChanges={false}
                  anchor={{ x: 0.5, y: 0.35 }}
                  centerOffset={{ x: 0, y: 14 }}
                >
                  <View style={styles.myNoteWrap}>
                    <View style={styles.myRingOuter}>
                      <View style={styles.myRingInner}>
                        <View style={styles.myDot} />
                      </View>
                    </View>
                    <Text style={styles.myNoteTag}>MY NOTE</Text>
                  </View>
                </Marker>
              );
            }
            const size = dotSize(cairn.stone_count);
            return (
              <Marker
                key={cairn.id}
                coordinate={{ latitude: cairn.lat, longitude: cairn.lng }}
                onPress={() => openNote(cairn.id)}
                tracksViewChanges={false}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View
                  style={{
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: colors.contour,
                    opacity: dotOpacity(cairn.stone_count),
                  }}
                />
              </Marker>
            );
          })}

        {/* 05 — heat rings. Three concentric translucent circles per cluster. */}
        {heatMode &&
          clusters.map((cluster) => {
            const outer = heatRadiusM(cluster, region.latitudeDelta);
            const center = {
              latitude: cluster.latitude,
              longitude: cluster.longitude,
            };
            return [
              <Circle
                key={`${cluster.id}-r0`}
                center={center}
                radius={outer}
                fillColor="rgba(255, 90, 31, 0.10)"
                strokeColor="transparent"
                strokeWidth={0}
              />,
              <Circle
                key={`${cluster.id}-r1`}
                center={center}
                radius={outer * 0.6}
                fillColor="rgba(255, 90, 31, 0.14)"
                strokeColor="transparent"
                strokeWidth={0}
              />,
              <Circle
                key={`${cluster.id}-r2`}
                center={center}
                radius={outer * 0.3}
                fillColor="rgba(255, 90, 31, 0.30)"
                strokeColor="transparent"
                strokeWidth={0}
              />,
            ];
          })}

        {/* 05 — "N NOTES" badges over the rings. */}
        {heatMode &&
          clusters.map((cluster) => (
            <Marker
              key={`${cluster.id}-badge`}
              coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.clusterBadge}>
                <Text style={styles.clusterBadgeText}>
                  {cluster.noteCount === 1 ? '1 NOTE' : `${cluster.noteCount} NOTES`}
                </Text>
              </View>
            </Marker>
          ))}
      </MapView>

      <SafeAreaView
        style={styles.overlay}
        pointerEvents="box-none"
        edges={['top', 'bottom']}
      >
        {heatMode ? (
          <View style={styles.heatBar}>
            <MonoLabel size="sm" color={colors.t45}>
              Zoomed out
            </MonoLabel>
            <MonoLabel size="sm" color={colors.accent}>
              Heat map on
            </MonoLabel>
          </View>
        ) : (
          <View style={styles.topBar}>
            <Pressable onPress={() => router.push('/profile')} hitSlop={8}>
              <Avatar initial="A" size={34} />
            </Pressable>
            <View style={styles.topBarCenter}>
              <Text style={styles.placeName} numberOfLines={1}>
                {placeName ?? 'Nearby'}
              </Text>
              <MonoLabel size="xs" color={colors.t45} numberOfLines={1}>
                {statusLine}
              </MonoLabel>
            </View>
            <View style={styles.topBarRight}>
              {loading ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : null}
              <MonoLabel size="xs" color={colors.accent}>
                Public
              </MonoLabel>
              <SquareToggle value={publicOnly} onChange={setPublicOnly} />
            </View>
          </View>
        )}

        <View style={styles.spacer} pointerEvents="none" />

        {heatMode ? (
          <View style={styles.zoomControl}>
            <Pressable
              style={[styles.zoomButton, styles.zoomButtonDivider]}
              onPress={() => zoomBy(0.5)}
              hitSlop={6}
            >
              <Text style={styles.zoomGlyph}>+</Text>
            </Pressable>
            <Pressable style={styles.zoomButton} onPress={() => zoomBy(2)} hitSlop={6}>
              <Text style={styles.zoomGlyph}>−</Text>
            </Pressable>
          </View>
        ) : null}

        <BottomNav />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  overlay: { flex: 1 },
  spacer: { flex: 1 },

  // 04 — location bar.
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.scrim,
    borderWidth: 1,
    borderColor: colors.t18,
  },
  topBarCenter: { flex: 1, alignItems: 'center', gap: 2, minWidth: 0 },
  placeName: { fontSize: 15, fontWeight: '600', color: colors.text },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // 05 — heat bar.
  heatBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.scrim,
    borderWidth: 1,
    borderColor: colors.t18,
  },

  // 04 — my-note marker: 26px orange core inside two soft rings.
  myNoteWrap: { alignItems: 'center', gap: 7 },
  myRingOuter: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(255, 90, 31, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  myRingInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 90, 31, 0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  myDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
  },
  myNoteTag: {
    ...type.monoSmall,
    color: colors.accent,
    backgroundColor: 'rgba(9, 28, 30, 0.85)',
    paddingVertical: 3,
    paddingHorizontal: 7,
    overflow: 'hidden',
  },

  // 05 — cluster badge.
  clusterBadge: {
    backgroundColor: colors.scrim,
    borderWidth: 1,
    borderColor: colors.accent50,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  clusterBadgeText: { ...type.monoSmall, color: colors.text },

  // 05 — zoom control.
  zoomControl: {
    alignSelf: 'flex-end',
    marginRight: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.scrim,
  },
  zoomButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomButtonDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  zoomGlyph: { fontSize: 16, color: colors.text, fontFamily: 'SpaceMono_400Regular' },
});
