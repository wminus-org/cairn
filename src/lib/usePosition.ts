/**
 * The one position source for the whole app (CRN-008).
 *
 * THIS MODULE OWNS THE ONLY CALL TO `expo-location`. `grep -r
 * "watchPositionAsync\|getCurrentPositionAsync\|requestForegroundPermissions"
 * src app` must return hits in this file and nowhere else. That grep is an
 * acceptance criterion on CRN-025, and it is not bookkeeping: three things read
 * position (the drop button's coordinate, Nearby's distance sort, the proximity
 * RPCs) and a second watch means a second permission race, a second inconsistent
 * fix, and a demo-mode override that silently does not apply to one screen. If a
 * screen needs position, it calls `usePosition()`. If a non-React module needs
 * it, it calls `getPosition()`.
 *
 * WHY A MODULE SINGLETON AND NOT A CONTEXT PROVIDER. Both solve "one watch";
 * the singleton also solves three things a provider does not, and costs a
 * refcount:
 *   - it is readable outside React, so a throttled RPC caller or CRN-025's
 *     route driver does not have to be a component to see or set the position;
 *   - there is no provider to forget in `app/_layout.tsx`, and no second
 *     provider to accidentally mount in a modal route, which would restore the
 *     two-watch bug through the front door;
 *   - it survives React 19 StrictMode's double mount and Fast Refresh, where a
 *     naive `useEffect` start/stop reliably creates two subscriptions in dev.
 *
 * FOREGROUND ONLY. No background modes, no `Always` permission, no geofence
 * entry. PLAN.md rules it out explicitly — it eats two hours and never appears
 * on stage. Do not add `NSLocationAlwaysAndWhenInUseUsageDescription`; adding it
 * invites using it.
 *
 * THE OVERRIDE SEAM (for CRN-025, not built here). `setPositionOverride(fix)`
 * replaces what every consumer sees, at the hook, so distance labels, the blur
 * curve, the gate call and the map camera cannot tell the difference. It does
 * not bypass the gate and must never be made to: it lies about *where you are*,
 * the server still decides what unlocks. See `setPositionOverride` below.
 */
import * as Location from 'expo-location';
import { useSyncExternalStore } from 'react';

// --- Public shape -----------------------------------------------------------

/**
 * `idle` before anything has been asked; `requesting` while the dialog is up;
 * `unavailable` when location services are off at the OS level or the watch
 * failed to start for a reason that is not a denial.
 *
 * While an override is active this reads `granted` on purpose — see
 * `setPositionOverride`.
 */
export type PositionStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';

/** Where the visible position came from. The only field that betrays demo mode. */
export type PositionSource = 'device' | 'override';

/**
 * `{ latitude, longitude }`, the order `expo-location` reports and the order
 * `cairnApi` expects. Mapbox wants the opposite; convert with
 * `toMapboxPosition()` and nowhere else.
 */
export interface PositionCoords {
  latitude: number;
  longitude: number;
}

/** A complete fix, shaped like `expo-location`'s so overrides are indistinguishable. */
export interface PositionFix extends PositionCoords {
  /** Radius of uncertainty in metres. Indoors this can be 50–165m — surface it. */
  accuracy: number | null;
  /** Milliseconds since epoch. */
  timestamp: number;
}

export interface PositionState {
  /** `null` until the first fix lands. Every consumer must handle that. */
  coords: PositionCoords | null;
  /**
   * Metres of uncertainty on the current fix. Read it before blaming the gate:
   * a 165m indoor fix makes a 30m radius meaningless, and that number is the
   * difference between deciding to use demo mode at 15:00 and guessing.
   */
  accuracy: number | null;
  status: PositionStatus;
  /** Human-readable, already logged. `null` when nothing is wrong. */
  error: string | null;
  /** Timestamp of the current fix, or `null`. Staleness is the caller's call. */
  lastFixAt: number | null;
  source: PositionSource;
}

// --- Store ------------------------------------------------------------------

type Listener = () => void;

const listeners = new Set<Listener>();

let deviceFix: PositionFix | null = null;
let overrideFix: PositionFix | null = null;
let permissionStatus: PositionStatus = 'idle';
let errorMessage: string | null = null;

let subscription: Location.LocationSubscription | null = null;
let starting: Promise<void> | null = null;

/**
 * Cached because `useSyncExternalStore` compares snapshots by identity and
 * re-renders forever if `getSnapshot()` builds a fresh object each call. It is
 * replaced only inside `publish()`.
 */
let snapshot: PositionState = compose();

function compose(): PositionState {
  const fix = overrideFix ?? deviceFix;
  const overridden = overrideFix !== null;
  return {
    coords: fix ? { latitude: fix.latitude, longitude: fix.longitude } : null,
    accuracy: fix ? fix.accuracy : null,
    // An override reports `granted` and clears the error so that a screen
    // rendering "location unavailable" on denial stays quiet during the demo.
    // `source` is how you tell, and it is the only way.
    status: overridden ? 'granted' : permissionStatus,
    error: overridden ? null : errorMessage,
    lastFixAt: fix ? fix.timestamp : null,
    source: overridden ? 'override' : 'device',
  };
}

function publish(): void {
  snapshot = compose();
  for (const listener of listeners) listener();
}

// --- The single watch -------------------------------------------------------

/**
 * ~5m. Not 0 and not 1: a 1m interval is a callback storm that re-renders the
 * whole map on every tick, and 5m still feels live on foot.
 */
const DISTANCE_INTERVAL_M = 5;

async function startWatch(): Promise<void> {
  if (subscription) return;

  permissionStatus = 'requesting';
  publish();

  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      // If the dialog never appeared at all, the cause is almost always a
      // missing NSLocationWhenInUseUsageDescription in app.json — the request
      // then resolves as denied with no error and no prompt. Check that first.
      permissionStatus = 'denied';
      errorMessage = 'Location permission denied.';
      publish();
      return;
    }

    permissionStatus = 'granted';
    errorMessage = null;
    publish();

    const next = await Location.watchPositionAsync(
      {
        // `High`, not `BestForNavigation`. The higher tier is not more accurate
        // outdoors — it keeps the GPS chip and the motion coprocessor awake for
        // turn-by-turn, which is a battery cost with no accuracy payoff on foot,
        // and the demo runs on one phone. reference/design-system.md § GPS
        // behaviour rules it out by name.
        accuracy: Location.Accuracy.High,
        // Distance is the only trigger. A `timeInterval` alongside it fires the
        // callback on a clock whether or not you moved, which is a re-render
        // storm on the map at maximum power draw for no new information.
        distanceInterval: DISTANCE_INTERVAL_M,
      },
      (location) => {
        deviceFix = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          timestamp: location.timestamp,
        };
        // Device fixes keep arriving and keep being recorded while an override
        // is active; `compose()` just doesn't show them. That is what makes
        // toggling demo mode off land on a real position immediately rather
        // than on `null` until the next tick.
        if (!overrideFix) publish();
      },
      (reason) => {
        errorMessage = reason;
        publish();
      },
    );

    if (listeners.size === 0) {
      // Everyone unmounted while the permission dialog was up. Do not leave a
      // watch running with nobody reading it.
      next.remove();
      return;
    }
    subscription = next;
  } catch (error) {
    permissionStatus = 'unavailable';
    errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('[cairn] location watch failed to start:', errorMessage);
    publish();
  } finally {
    starting = null;
  }
}

/**
 * How long the watch outlives its last listener.
 *
 * Navigating map → Nearby → detail → back unmounts the outgoing screen before
 * the incoming one subscribes. Without a grace period that gap drops the
 * refcount to zero, removes the watch, and the next screen pays for a fresh
 * `requestForegroundPermissionsAsync` round-trip and a restarted fix counter —
 * the tick rate climbing across navigations is exactly what CRN-008 tests for.
 * Five seconds is long enough to span any transition and short enough that
 * backgrounding the app does not leave the GPS running.
 */
const TEARDOWN_GRACE_MS = 5000;

let teardownTimer: ReturnType<typeof setTimeout> | null = null;

function cancelPendingTeardown(): void {
  if (teardownTimer === null) return;
  clearTimeout(teardownTimer);
  teardownTimer = null;
}

/** Tear down after the grace period, unless a subscriber arrives first. */
function scheduleStopWatch(): void {
  if (teardownTimer !== null) return;
  teardownTimer = setTimeout(() => {
    teardownTimer = null;
    // Re-check: a subscriber that arrived and left again inside the window
    // cancels this timer, but belt and braces — never remove a live watch out
    // from under a listener.
    if (listeners.size === 0) stopWatch();
  }, TEARDOWN_GRACE_MS);
}

function stopWatch(): void {
  cancelPendingTeardown();
  subscription?.remove();
  subscription = null;
}

/**
 * Subscribe to position changes without React. Refcounted: the watch starts on
 * the first subscriber and stops `TEARDOWN_GRACE_MS` after the last one leaves,
 * so a screen transition does not restart it. Returns the unsubscribe.
 *
 * `usePosition()` is built on this; use it directly only from non-component
 * code (a route driver, a throttled RPC poller).
 */
export function subscribePosition(listener: Listener): () => void {
  // Before the size check: a subscriber arriving inside the grace window keeps
  // the existing watch rather than letting the timer kill it a moment later.
  cancelPendingTeardown();
  listeners.add(listener);
  if (listeners.size === 1 && !subscription && !starting) {
    starting = startWatch();
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) scheduleStopWatch();
  };
}

/** The current position without subscribing. Safe to call from anywhere. */
export function getPosition(): PositionState {
  return snapshot;
}

/**
 * The shared position. Safe to call from as many components as you like — they
 * all read one watch.
 *
 * ```ts
 * const { coords, accuracy, status, error } = usePosition();
 * if (!coords) return <Waiting status={status} />;
 * const cairns = await fetchNearbyCairns(coords);
 * ```
 */
export function usePosition(): PositionState {
  return useSyncExternalStore(subscribePosition, getPosition, getPosition);
}

// --- The override seam (CRN-025) -------------------------------------------

/** What a route driver hands in. `accuracy` and `timestamp` are filled if omitted. */
export interface PositionOverrideInput extends PositionCoords {
  accuracy?: number | null;
  timestamp?: number;
}

/**
 * Replace the position every consumer sees. Pass `null` to hand control back to
 * the device.
 *
 * This is the seam CRN-025 drives: a hardcoded waypoint route, interpolated at
 * walking pace (~1.4 m/s) and pushed in at roughly 1Hz, so that distances fall
 * continuously and the blur sharpens over seconds instead of snapping in one
 * frame. Emitting at 10Hz would rehearse behaviour the real device never shows.
 *
 * Three properties this seam is built to hold, all of which CRN-025 depends on:
 *
 *  1. **Consumers cannot tell.** The override feeds the same store, so distance
 *     labels, CRN-015's blur, the Nearby sort, the map camera and the RPC
 *     arguments all move together. There is no `if (demoMode)` anywhere else,
 *     and adding one is how a screen silently keeps showing the real GPS.
 *  2. **It never bypasses the gate.** It changes *where you claim to be* and
 *     nothing else. `cairn_detail` still re-derives distance server-side and
 *     still decides the band. If demo mode ever takes a different path to
 *     content, the path you rehearse stops being the path that runs.
 *  3. **It works with permission revoked.** No watch is required for an
 *     override to publish, so the route still advances with location switched
 *     off in Settings — which is the failure this exists to survive.
 *
 * The one thing left for CRN-025: `react-native-maps` draws its user puck from the
 * native SDK's own provider, which knows nothing about this. In override mode,
 * turn off native user-location and follow, and drive the camera and marker from
 * `usePosition()` — otherwise there are two dots on the mirrored screen.
 */
export function setPositionOverride(fix: PositionOverrideInput | null): void {
  overrideFix = fix
    ? {
        latitude: fix.latitude,
        longitude: fix.longitude,
        // Never `undefined`: a consumer that reads `accuracy` to decide whether
        // to trust a fix will reject it, and you will debug that at 16:15.
        accuracy: fix.accuracy ?? 5,
        timestamp: fix.timestamp ?? Date.now(),
      }
    : null;
  publish();
}

/** Hand control back to the device. The next real fix is already in hand. */
export function clearPositionOverride(): void {
  setPositionOverride(null);
}

export function isPositionOverridden(): boolean {
  return overrideFix !== null;
}

// --- Odds and ends ----------------------------------------------------------

/**
 * Re-ask for permission and start the watch if it is now granted. For the retry
 * affordance on the "location unavailable" state — iOS only shows the dialog
 * once, so after a hard denial this resolves denied again and the real fix is
 * Settings. It is still worth having: a first-run denial caused by a missing
 * usage string clears up the moment the string lands.
 */
export async function refreshPermission(): Promise<PositionStatus> {
  if (!subscription && !starting) {
    starting = startWatch();
  }
  await starting;
  return snapshot.status;
}

/**
 * The single lat/lng → Mapbox boundary. `expo-location` reports
 * `{ latitude, longitude }`; `react-native-maps` wants `[longitude, latitude]`.
 * Flip here and never again — a flipped pair puts a cairn in the Indian Ocean
 * and looks like a data bug for twenty minutes.
 */
export function toMapboxPosition(coords: PositionCoords): [number, number] {
  return [coords.longitude, coords.latitude];
}
