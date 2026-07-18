/**
 * CRN-006 — the map surface.
 *
 * A full-bleed `MapView` wearing the contour style, opening over Technology
 * Park. It renders the base and nothing else: cairn glyphs are CRN-007, the
 * user location puck is CRN-008, Space accent theming is E5. Anything that
 * knows what a cairn is belongs in `children`, not in this file.
 *
 * To point the map at a Studio style instead of the built-in JSON, see the
 * instructions at the top of `cairnStyle.ts`. Nothing in THIS file changes —
 * `resolveMapStyle()` returns either `{ styleURL }` or `{ styleJSON }` and the
 * spread below accepts both.
 */

import {
  Camera,
  MapView,
  type CameraStop,
  type MapState,
} from '@rnmapbox/maps';
import {
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactNode,
  type Ref,
} from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '../theme';
import { resolveMapStyle } from './cairnStyle';

/**
 * Technology Park, Ljubljana — the demo ground. `[longitude, latitude]`.
 *
 * COORDINATE ORDER IS THE #1 MAP BUG. Mapbox uses GeoJSON order (lng, lat)
 * everywhere — `centerCoordinate`, camera stops, feature geometry — while
 * `expo-location` returns `{ latitude, longitude }`. Swapping them does not
 * throw; it silently drops the camera in the Indian Ocean. Check this first
 * whenever the map looks wrong.
 *
 * This is CRN-006's value: good enough to point a camera at the right cluster
 * of buildings, NOT good enough to seed demo data with. CRN-026 must replace it
 * with a real on-site GPS reading before anything is pinned against it.
 */
export const TECHNOLOGY_PARK: readonly [number, number] = [14.472, 46.047];

/** Building scale. Contour geometry is absent below z9 — see cairnStyle.ts. */
export const INITIAL_ZOOM = 16;

/** Imperative camera control, for callers that need to move the map. */
export type MapCanvasHandle = {
  /** Full camera control — center, zoom, padding, animation. */
  setCamera(stop: CameraStop): void;
  /** Animate to a coordinate, keeping the current zoom. `[lng, lat]`. */
  flyTo(center: readonly [number, number], durationMs?: number): void;
};

export type MapCanvasProps = {
  /** Marker layers and overlays. CRN-007 mounts cairn glyphs here. */
  children?: ReactNode;
  /** Opening camera position, `[lng, lat]`. Defaults to Technology Park. */
  initialCenter?: readonly [number, number];
  /** Opening zoom. Defaults to {@link INITIAL_ZOOM}. */
  initialZoom?: number;
  /** Container style. Defaults to filling its parent. */
  style?: StyleProp<ViewStyle>;
  /** Fires once the style and first frame are up. */
  onDidFinishLoadingMap?: () => void;
  /**
   * Fires continuously while the camera moves — CRN-007 uses it to refetch
   * `cairns_nearby` for the visible viewport. It is HIGH FREQUENCY (roughly
   * per frame during a gesture); throttle in the consumer, not here, so this
   * component stays free of policy.
   */
  onCameraChanged?: (state: MapState) => void;
  /**
   * React 19 passes `ref` as an ordinary prop — no `forwardRef` wrapper
   * needed, and `forwardRef` is deprecated in this version.
   */
  ref?: Ref<MapCanvasHandle>;
};

export function MapCanvas({
  children,
  initialCenter = TECHNOLOGY_PARK,
  initialZoom = INITIAL_ZOOM,
  style,
  onDidFinishLoadingMap,
  onCameraChanged,
  ref,
}: MapCanvasProps) {
  const cameraRef = useRef<Camera | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      setCamera: (stop) => cameraRef.current?.setCamera(stop),
      flyTo: (center, durationMs) =>
        // Mutable copy: Mapbox's `Position` is a plain number[] and will not
        // accept our readonly tuple.
        cameraRef.current?.flyTo([center[0], center[1]], durationMs),
    }),
    [],
  );

  /**
   * `defaultSettings` (uncontrolled), not `centerCoordinate` (controlled).
   * A controlled camera snaps back to its prop after every gesture and fights
   * the user's pan. Programmatic movement goes through the handle above.
   *
   * Memoised on the primitive lng/lat/zoom rather than on the tuple identity,
   * so a caller passing an inline `[14.472, 46.047]` literal does not re-seed
   * the camera on every render.
   */
  const defaultSettings = useMemo<CameraStop>(
    () => ({
      centerCoordinate: [initialCenter[0], initialCenter[1]],
      zoomLevel: initialZoom,
    }),
    [initialCenter[0], initialCenter[1], initialZoom],
  );

  return (
    <View style={[styles.container, style]}>
      <MapView
        style={styles.map}
        // Either { styleURL } or { styleJSON } — see cairnStyle.ts.
        {...resolveMapStyle()}
        // Flat map. Pitch and rotation are explicitly off: the contour base is
        // a plan view of terrain and 3D is not on the board for today.
        projection="mercator"
        pitchEnabled={false}
        rotateEnabled={false}
        // Chrome the design system does not permit. The Mapbox logo and
        // attribution stay ON — that is a Terms of Service requirement, not a
        // style choice. Do not "clean up" the map by disabling them.
        scaleBarEnabled={false}
        compassEnabled={false}
        logoEnabled
        attributionEnabled
        onDidFinishLoadingMap={onDidFinishLoadingMap}
        onCameraChanged={onCameraChanged}
        onMapLoadingError={() => {
          // Most likely causes, in order: an unpublished Studio style in
          // EXPO_PUBLIC_MAPBOX_STYLE_URL, a pk.* token that lacks access to
          // it, or no network. A blank green map with no error here is
          // usually just zoom — contours do not exist below z9.
          console.warn(
            '[cairn] Mapbox failed to load the base style. If ' +
              'EXPO_PUBLIC_MAPBOX_STYLE_URL is set, confirm the style is ' +
              'PUBLISHED and readable by the pk.* token; unset it to fall ' +
              'back to the built-in contour style.',
          );
        }}
      >
        <Camera ref={cameraRef} defaultSettings={defaultSettings} />
        {children}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // The base colour is also the style's background layer. Setting it here
    // too means the gap before the first frame is the same green rather than
    // a white flash.
    backgroundColor: colors.background,
  },
  map: {
    flex: 1,
  },
});
