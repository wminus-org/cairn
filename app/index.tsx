/**
 * The map screen.
 *
 * Apple Maps via react-native-maps, chosen so this runs in Expo Go with no
 * token and no native build. This screen's job is: show where the cairns are,
 * show where you are, and open one when you tap it.
 *
 * MapKit cannot be restyled, so the contour base from the design system is not
 * available and is not coming. Every bit of craft therefore lives in what sits
 * *on* the tiles and *around* them — the stacked-stone glyph, the distance
 * readout under it, the scrim that seats bone type against tiles we do not
 * control. Each of those is in src/map/ and each is built to survive both a
 * white tile and a black one on its own, without relying on the scrim.
 *
 * The two rules that survive from the Mapbox version, because they are
 * architecture and not aesthetics:
 *   - Every RPC goes through src/lib/cairnApi.ts. Never call supabase.rpc here.
 *   - Position comes from the single watch in src/lib/usePosition.ts, so demo
 *     mode (CRN-025) can override one thing and have everything follow.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import DropCairnSheet from '../src/capture/DropCairnSheet';
import {
  fetchNearbyCairns,
  isCairnApiError,
  type CairnSummary,
} from '../src/lib/cairnApi';
import { usePosition } from '../src/lib/usePosition';
import { glyphStroke } from '../src/map/accent';
import CairnMarkerBody, {
  MARKER_ANCHOR,
  formatDistance,
} from '../src/map/CairnMarkerBody';
import DropButton from '../src/map/DropButton';
import MapScrim from '../src/map/MapScrim';
import StatusLine from '../src/map/StatusLine';
import { colors } from '../src/theme';

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

/**
 * How far from your actual fix a long-press may place a cairn.
 *
 * 30 m is `cairns.radius_m`'s default, which makes this more than a sanity
 * limit: a cairn dropped that close still contains the walker, so the first
 * stone would have cleared stack_stone's proximity check on an honest position
 * too. That matters because DropCairnSheet takes one `coords` and it is both
 * the drop point AND the proximity proof — an unclamped long-press would hand
 * the server a position it cannot help but accept, and the whole product is
 * the claim that you had to be there. Long-press is for nudging a pin onto the
 * thing you mean when GPS puts you through a wall. It is not a way to leave a
 * note in a city you are not in.
 */
const MAX_DROP_OFFSET_M = 30;

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
 * One cairn on the map.
 *
 * This exists as its own component only to hold `tracksViewChanges`. iOS
 * snapshots a Marker's children once and then stops watching them, so mounting
 * with tracking already off captures the glyph before it has laid out and the
 * cairn draws blank — a map with a user dot and nothing else on it, which is
 * indistinguishable from cairns_nearby returning no rows and sends you
 * debugging the RPC. Track until the glyph reports a layout, then stop: we pay
 * for the watcher for one frame instead of for the whole session.
 */
function CairnMarker({ cairn, onPress }: { cairn: CairnSummary; onPress: () => void }) {
  const [tracks, setTracks] = useState(true);

  const here = cairn.distance_m < cairn.radius_m;
  const stroke = glyphStroke({
    spaceId: cairn.space_id,
    accentHex: cairn.accent_hex,
    here,
  });

  /**
   * Everything the snapshot can show, as one string. A refetch can move a
   * cairn into a different height bucket once someone stacks on it, change the
   * distance under it, or walk the user into its radius and turn it amber —
   * and the frozen bitmap would keep the old one. Re-arm on any of them; the
   * re-render guarantees onLayout fires again to turn tracking back off, so we
   * pay for the watcher for a frame rather than for the session.
   */
  const painted = `${cairn.stone_count}|${formatDistance(
    cairn.distance_m,
    cairn.radius_m,
  )}|${stroke}`;
  useEffect(() => setTracks(true), [painted]);

  return (
    <Marker
      coordinate={{ latitude: cairn.lat, longitude: cairn.lng }}
      /**
       * A cairn sits on its point, so the anchor is the base of the stack, not
       * the centre of the marker box.
       */
      anchor={MARKER_ANCHOR}
      /**
       * No `title`/`description`: those summon Apple's own white callout
       * bubble, which is the one piece of UI on this screen we cannot style
       * and would be the only rounded white object in the whole app. The tap
       * opens the thread, which is where a cairn's title belongs.
       */
      tracksViewChanges={tracks}
      // The thread screen refetches with its own position, so nothing
      // about the cairn travels in the route but its id.
      onPress={onPress}
      accessibilityLabel={`${cairn.title ?? 'Cairn'}, ${cairn.stone_count} ${
        cairn.stone_count === 1 ? 'stone' : 'stones'
      }, ${here ? 'you are here' : `${cairn.distance_m} metres away`}`}
    >
      <View onLayout={() => setTracks(false)}>
        <CairnMarkerBody
          stoneCount={cairn.stone_count}
          distanceM={cairn.distance_m}
          radiusM={cairn.radius_m}
          stroke={stroke}
        />
      </View>
    </Marker>
  );
}

export default function MapScreen() {
  const router = useRouter();
  const { coords, status, error: positionError } = usePosition();
  const [cairns, setCairns] = useState<CairnSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dropping, setDropping] = useState(false);
  /**
   * Where the pending drop lands. `null` means "at my feet" and lets the live
   * fix flow through to the sheet, which is what the button has always done —
   * the sheet snapshots at submit so the cairn lands where you were standing
   * when you spoke. A long-press sets an explicit point instead and freezes it,
   * because a hand-placed pin that drifts with the walker is not hand-placed.
   */
  const [dropPoint, setDropPoint] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );
  const [dropTooFar, setDropTooFar] = useState(false);

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

  /**
   * A drop is the one case where the distance throttle is wrong: the cairn set
   * changed under a user who has not moved a metre, so the movement test would
   * hold the new pin off the map indefinitely. Calling load() directly skips
   * that test — the throttle lives in the position effect, not in load itself.
   */
  const handleDropped = useCallback(() => {
    setDropping(false);
    setDropPoint(null);
    if (!coords) return;
    void load({ latitude: coords.latitude, longitude: coords.longitude });
  }, [coords, load]);

  /** The button entry point: drop at my feet, tracking the live fix. */
  const handleDropHere = useCallback(() => {
    setDropPoint(null);
    setDropTooFar(false);
    setDropping(true);
  }, []);

  /**
   * The long-press entry point (CRN-009 AC1). Same sheet, same submit — the
   * only difference is where the cairn lands. react-native-maps hands back a
   * full synthetic event; we narrow it to lat/lng here so nothing downstream
   * has to know react-native-maps exists.
   */
  const handleLongPress = useCallback(
    (event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
      // No fix means nothing to measure the press against, and the sheet is not
      // even mounted. Same reason the button is disabled.
      if (!coords) return;
      const point = event.nativeEvent.coordinate;
      if (metresBetween(coords, point) > MAX_DROP_OFFSET_M) {
        setDropTooFar(true);
        return;
      }
      setDropTooFar(false);
      setDropPoint({ latitude: point.latitude, longitude: point.longitude });
      setDropping(true);
    },
    [coords],
  );

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
    if (dropTooFar) return 'Too far from you. Press closer to where you are standing.';
    if (loadError) return loadError;
    if (cairns.length === 0) return 'No cairns nearby. Drop the first one.';
    return `${cairns.length} ${cairns.length === 1 ? 'cairn' : 'cairns'} nearby`;
  }, [status, coords, dropTooFar, loadError, cairns.length, positionError]);

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
        onLongPress={handleLongPress}
      >
        {cairns.map((cairn) => (
          <CairnMarker
            key={cairn.id}
            cairn={cairn}
            onPress={() => router.push(`/cairn/${cairn.id}`)}
          />
        ))}
      </MapView>

      {/* Seats bone type against tiles we do not control. Behind the overlay,
          above the map, and deaf to touches so long-press still reaches it. */}
      <MapScrim />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <StatusLine text={statusLine} busy={loading} />

        <View style={styles.spacer} pointerEvents="none" />

        <DropButton ready={!!coords} onPress={handleDropHere} />
      </SafeAreaView>

      {/* The sheet requires a fix — it has nowhere to put the cairn without one.
          Mounting it only when we have coords also means a fix lost mid-drop
          tears the sheet down rather than silently relocating the pin. */}
      {coords ? (
        <DropCairnSheet
          visible={dropping}
          coords={dropPoint ?? coords}
          onClose={() => {
            setDropping(false);
            setDropPoint(null);
          }}
          onDropped={handleDropped}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  overlay: { flex: 1, justifyContent: 'space-between' },
  spacer: { flex: 1 },
});
