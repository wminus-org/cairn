import { type MapState } from '@rnmapbox/maps';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { missingEnv } from '../src/env';
import { type CairnSummary, fetchNearbyCairns } from '../src/lib/cairnApi';
import { initMapbox } from '../src/lib/mapbox';
import { toMapboxPosition, usePosition } from '../src/lib/usePosition';
import { CairnGlyphs } from '../src/map/CairnGlyphs';
import { MapCanvas, type MapCanvasHandle } from '../src/map/MapCanvas';
import { UserPuck, type PuckFix } from '../src/map/UserPuck';
import { colors, space, type } from '../src/theme';

/**
 * The map screen. CRN-008 assembles it.
 *
 * Three pieces built elsewhere, wired here:
 *   MapCanvas   CRN-006 — the contour-only base and the MapView itself
 *   CairnGlyphs CRN-007 — the stacked-stone symbol layer
 *   UserPuck    CRN-008 — this ticket, the user's own position
 *
 * and two data sources, both owned elsewhere:
 *   usePosition()        one shared location watch (CRN-008 lib half)
 *   fetchNearbyCairns()  the tier-1 RPC (CRN-005)
 *
 * This file starts no watch and calls no RPC directly. If a `supabase.rpc` or
 * a `watchPositionAsync` ever appears below this comment, it is a bug.
 *
 * MapCanvas owns the MapView, the base style and the one and only <Camera>.
 * This screen never mounts a second Camera — two on one MapView fight each
 * other. It drives the existing one through `MapCanvasHandle.setCamera`, and
 * observes gestures through `onCameraChanged`. The opening Technology Park
 * framing is MapCanvas's own default and is deliberately not repeated here.
 */

/** Close enough to read individual glyphs when the camera snaps back to you. */
const FOLLOW_ZOOM = 16.5;

/**
 * How far out to ask for cairns. The server default is 5000m; we ask for less
 * because the demo is a walk, and a smaller radius keeps the glyph set small
 * enough that CRN-007's symbol layer never has to think about clustering.
 */
const NEARBY_RADIUS_M = 2000;

/**
 * ── Refetch throttle ─────────────────────────────────────────────────────
 * The watch fires roughly every 5m of movement. Firing an RPC on every tick
 * would be ~12 round trips per minute of walking, for a set of cairns that has
 * not changed.
 *
 * So: refetch when the user has moved 75m from wherever we last fetched, or
 * when 30s have passed, whichever comes first.
 *
 * 75m is chosen against the mechanic rather than against the network. The
 * Approach band starts at 200m, so a 75m budget guarantees a cairn is in the
 * feed well before it can matter — worst case we learn about it at 275m, still
 * outside the band. And this RPC only refreshes *which* cairns exist and their
 * stone counts; the live distance driving the blur/sharpen ramp is recomputed
 * client-side from `usePosition()` at 1Hz (CRN-015), so a stale `distance_m`
 * from the server is never what the user reads.
 *
 * 30s covers the stationary case — someone else stacking a stone on a cairn
 * you are standing at should show up without you walking away and back.
 */
const REFETCH_DISTANCE_M = 75;
const REFETCH_INTERVAL_MS = 30_000;
/** How often we re-evaluate the two rules above while standing still. */
const REFETCH_CHECK_MS = 10_000;

/**
 * A fix older than this stops being drawn as current. Two GPS ticks' worth of
 * silence at a walking pace.
 */
const STALE_FIX_MS = 20_000;

/**
 * Permission granted but nothing has arrived — long enough to stop saying
 * "locating" and start saying something useful.
 */
const NO_FIX_TIMEOUT_MS = 20_000;

/** Motion: state changes are 200ms, distance-driven movement is 400ms. */
const CAMERA_MS = 400;

/**
 * At import, not in an effect — a parent's `useEffect` runs after its children
 * have mounted, so initialising in `_layout` would race the MapView below.
 * `initMapbox()` is idempotent and returns false when the pk.* token is absent.
 */
const mapReady = initMapbox();

/**
 * Metres between two coordinates, equirectangular. At the 75m scale this is
 * used for, the error against haversine is far below a GPS fix's own noise,
 * and it costs one cosine instead of six trig calls per tick.
 */
function metresBetween(
  latA: number,
  lngA: number,
  latB: number,
  lngB: number,
): number {
  const toRad = Math.PI / 180;
  const meanLat = ((latA + latB) / 2) * toRad;
  const x = (lngB - lngA) * toRad * Math.cos(meanLat);
  const y = (latB - latA) * toRad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

export default function Index() {
  const missing = missingEnv();

  // `error` is deliberately not read: the hook already logs it, and a raw
  // error string has no place on a map. `status` carries everything this
  // screen needs to say something in the project's own voice.
  const { coords, accuracy, status, lastFixAt } = usePosition();

  const [cairns, setCairns] = useState<CairnSummary[]>([]);
  const [feedFailed, setFeedFailed] = useState(false);

  /** Camera tracks the user until a gesture says otherwise. */
  const [following, setFollowing] = useState(true);
  const mapRef = useRef<MapCanvasHandle>(null);

  /** Drives both the stationary refetch check and the staleness readout. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), REFETCH_CHECK_MS);
    return () => clearInterval(id);
  }, []);

  const [noFixYet, setNoFixYet] = useState(false);
  useEffect(() => {
    if (coords) {
      setNoFixYet(false);
      return;
    }
    const id = setTimeout(() => setNoFixYet(true), NO_FIX_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [coords]);

  // ── Nearby feed ────────────────────────────────────────────────────────
  const lastFetch = useRef<{ lat: number; lng: number; at: number } | null>(
    null,
  );
  /**
   * Monotonic, so a slow response from an earlier position can never overwrite
   * a fast one from a later position. Also doubles as the unmount guard.
   */
  const generation = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!coords) return;

    const prev = lastFetch.current;
    const movedM = prev
      ? metresBetween(prev.lat, prev.lng, coords.latitude, coords.longitude)
      : Number.POSITIVE_INFINITY;
    const agedMs = prev ? Date.now() - prev.at : Number.POSITIVE_INFINITY;

    if (movedM < REFETCH_DISTANCE_M && agedMs < REFETCH_INTERVAL_MS) return;
    // One request at a time. A slow network must not queue up a backlog of
    // requests that all land at once when it recovers.
    if (inFlight.current) return;

    const mine = generation.current + 1;
    generation.current = mine;
    inFlight.current = true;
    lastFetch.current = {
      lat: coords.latitude,
      lng: coords.longitude,
      at: Date.now(),
    };

    fetchNearbyCairns(coords, { maxMeters: NEARBY_RADIUS_M })
      .then((rows) => {
        if (generation.current !== mine) return;
        setCairns(rows);
        setFeedFailed(false);
      })
      .catch((err: unknown) => {
        if (generation.current !== mine) return;
        console.warn('[cairn] nearby feed failed', err);
        // Keep whatever glyphs we already have. A map that briefly stops
        // updating beats a map that empties itself on one dropped request.
        setFeedFailed(true);
      })
      .finally(() => {
        inFlight.current = false;
      });
    // `now` is a deliberate dep: it is the only thing that ticks while the user
    // stands still, and it is what makes REFETCH_INTERVAL_MS mean anything.
  }, [coords, now]);

  useEffect(() => {
    return () => {
      // Invalidate any in-flight response so it cannot setState after unmount.
      generation.current += 1;
    };
  }, []);

  // ── Follow mode ────────────────────────────────────────────────────────
  /**
   * Imperative `setCamera` through MapCanvas's handle, rather than a controlled
   * `centerCoordinate`. A controlled centre re-asserts itself mid-gesture and
   * the map visibly fights the thumb; an imperative call only moves the camera
   * when we ask it to, so releasing follow is simply "stop asking".
   */
  useEffect(() => {
    if (!following || !coords) return;
    mapRef.current?.setCamera({
      centerCoordinate: toMapboxPosition(coords),
      zoomLevel: FOLLOW_ZOOM,
      animationDuration: CAMERA_MS,
      animationMode: 'easeTo',
    });
  }, [following, coords]);

  const handleCameraChanged = useCallback((state: MapState) => {
    // `isGestureActive` is true only for user input — our own animated
    // setCamera above does not raise it, so follow mode cannot cancel itself.
    if (state.gestures.isGestureActive) setFollowing(false);
  }, []);

  /**
   * Flipping the flag is the whole action: `following` is a dependency of the
   * effect above, so re-engaging moves the camera on this render rather than
   * waiting for the next GPS tick — which, standing still, may never come.
   */
  const recenter = useCallback(() => setFollowing(true), []);

  const handleSelectCairn = useCallback((cairnId: string) => {
    // The cairn sheet and the stone thread are CRN-016; there is no route to
    // push to yet. Logged so CRN-007's tap acceptance criterion is checkable.
    console.log('[cairn] selected', cairnId);
  }, []);

  // ── Copy ───────────────────────────────────────────────────────────────
  const fixAgeMs = lastFixAt != null ? now - lastFixAt : null;
  const stale = fixAgeMs != null && fixAgeMs > STALE_FIX_MS;

  /**
   * `usePosition()` keeps position and accuracy as sibling fields; the puck
   * wants them together. Memoised because a fresh object every render would
   * re-upload the shape source across the native bridge on each tick.
   */
  const puckFix = useMemo<PuckFix | null>(
    () =>
      coords
        ? {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy,
          }
        : null,
    [coords, accuracy],
  );

  /**
   * Every one of these leaves the map on screen. Denying location costs you
   * the dot and the unlocks, not the app — contours and glyphs still render
   * behind this copy, which is why it is a line at the foot and not a wall.
   */
  let notice: string | null = null;
  if (status === 'denied') {
    notice =
      'Without location, nothing here can open. Turn it on in Settings and the map fills in as you walk.';
  } else if (status === 'unavailable') {
    notice =
      'Location services are off on this device. The map still reads; nothing will unlock until they are back on.';
  } else if (!coords && noFixYet) {
    notice =
      'Location is on, but no fix has reached us yet. Under open sky it usually takes a few seconds.';
  } else if (stale) {
    notice = 'The last fix is a while old. Your position may have drifted.';
  } else if (feedFailed) {
    notice = 'Could not reach the cairns just now. Showing what was last known.';
  }

  /**
   * Two different things share this line, and only one of them ships.
   *
   * The states below are *copy*: they name a condition the user can act on
   * ("location is off"), and they only appear when there is nothing on the map
   * to say it for them. Once a fix lands, the puck is the readout, and this
   * line goes away — a map with a dot on it does not need a caption.
   *
   * The metres-of-uncertainty figure is a debug instrument, not copy.
   * design-system.md restraint 5: "The only number in the app is a distance, a
   * stone count, or a pin index." An accuracy radius is none of those, so it is
   * gated to `__DEV__` — which is exactly what CRN-008's acceptance asks for
   * ("readable somewhere in a dev build"). At 15:00, deciding whether to switch
   * on demo mode, it is the difference between reading a number and guessing;
   * in the build we demo, it is a fourth number on the primary surface.
   */
  let readout: string | null = null;
  if (status === 'denied') readout = 'LOCATION OFF';
  else if (status === 'unavailable') readout = 'LOCATION UNAVAILABLE';
  else if (!coords) readout = status === 'requesting' ? 'ASKING' : 'LOCATING';
  else if (__DEV__) {
    readout =
      accuracy == null ? 'FIX · ACCURACY UNKNOWN' : `FIX ±${Math.round(accuracy)} M`;
  }

  // No pk.* token means no tiles, only a grey rectangle. Say so plainly
  // instead of rendering a map that cannot work.
  if (!mapReady) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.body}>
          <Text style={styles.mark}>CAIRN</Text>
          <Text style={styles.sentence}>
            Notes left at places, for whoever stands there next.
          </Text>

          <View style={styles.missingBlock}>
            <Text style={styles.missingHeading}>MISSING ENVIRONMENT</Text>
            {missing.map((key) => (
              <Text key={key} style={styles.missingKey}>
                {key}
              </Text>
            ))}
            <Text style={styles.meta}>
              Copy .env.example to .env, fill it in, then restart Metro with
              --clear.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.screen}>
      <MapCanvas ref={mapRef} onCameraChanged={handleCameraChanged}>
        {/*
          Glyphs render whether or not we know where the user is. Denying
          location must leave a usable map, not an empty screen.
        */}
        <CairnGlyphs cairns={cairns} onSelect={handleSelectCairn} />

        {/* Declared last so the puck draws over the glyphs. */}
        <UserPuck fix={puckFix} stale={stale} />
      </MapCanvas>

      {/* pointerEvents="box-none" — the overlay must never swallow a map pan,
          but the recenter control inside it still has to receive taps. */}
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <Text style={styles.mark}>CAIRN</Text>

        <View style={styles.foot} pointerEvents="box-none">
          {/*
            Only shown when follow is released. A control that is always there
            is a control the user has to read every time; this one appears
            exactly when it has something to offer.
          */}
          {!following && coords ? (
            <Pressable
              onPress={recenter}
              hitSlop={space.sm}
              accessibilityRole="button"
              accessibilityLabel="Recentre the map on your position"
              style={({ pressed }) => [
                styles.recenter,
                pressed && styles.recenterPressed,
              ]}
            >
              {/*
                No icon set in this app. The mark is the puck itself — a ring
                and a dot, the same geometry drawn on the map — which reads as
                "back to me" without inventing a glyph.
              */}
              <View style={styles.recenterRing}>
                <View style={styles.recenterDot} />
              </View>
            </Pressable>
          ) : null}

          {/*
            Wrapped rather than setting pointerEvents on the Text itself: under
            `box-none` the children are still touchable, and read-only copy must
            not eat a pan that starts on top of it.
          */}
          {notice || readout ? (
            <View pointerEvents="none" style={styles.status}>
              {notice ? <Text style={styles.sentence}>{notice}</Text> : null}
              {readout ? <Text style={styles.meta}>{readout}</Text> : null}
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    gap: space.lg,
  },
  foot: {
    alignItems: 'flex-start',
    gap: space.md,
    paddingBottom: space.lg,
  },
  mark: {
    ...type.mono,
    color: colors.text,
    opacity: 0.4,
    paddingTop: space.md,
  },
  /**
   * The only non-mono size on this screen. Two type sizes per screen is the
   * rule and mono is a register rather than a size, so `body` is the whole
   * budget here.
   */
  sentence: {
    ...type.body,
    color: colors.textMuted,
    maxWidth: 320,
  },
  meta: {
    ...type.mono,
    color: colors.textFaint,
  },
  status: {
    gap: space.sm,
  },
  recenter: {
    // 44 × 44 — the minimum tap target, held regardless of the mark inside it.
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: space.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.background,
  },
  recenterPressed: {
    // Elevation is a hairline and a 6% fill. There are no shadows in this app.
    borderColor: colors.text,
  },
  recenterRing: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recenterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.text,
  },
  missingBlock: {
    // 8pt is the smallest step; the 4pt one was removed with the theme rework.
    gap: space.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.unresolved,
    paddingLeft: space.md,
  },
  missingHeading: {
    ...type.mono,
    color: colors.unresolved,
  },
  missingKey: {
    ...type.mono,
    color: colors.text,
  },
});
