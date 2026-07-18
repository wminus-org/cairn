import { CircleLayer, FillLayer, ShapeSource } from '@rnmapbox/maps';
import { useMemo } from 'react';

import { colors } from '../theme';

/**
 * The user's own position, drawn on the map.
 *
 * Deliberately NOT `<UserLocation />` / `<LocationPuck />` from @rnmapbox/maps.
 * Those components run Mapbox's own native location engine, which fires a
 * second iOS permission dialog on top of the one `expo-location` already asked
 * for (CRN-008, "Notes & traps") and starts a second GPS subscription behind
 * the single watch this app is supposed to own. We already hold the coordinate
 * — we just draw it.
 *
 * Restraint: a field journal, not a navigation app. No heading cone, no
 * pulsing halo, no shadow. A bone dot on the base colour, and — only when the
 * fix is genuinely poor — a soft ring showing how little we actually know.
 *
 * Amber is not used here. Amber means "you are inside a cairn's radius and it
 * is open to you"; the user dot is not one of its five permitted homes.
 */

/** A position good enough to draw. Structurally what `usePosition()` yields. */
export type PuckFix = {
  latitude: number;
  longitude: number;
  /** Horizontal accuracy in metres, or null when the platform won't say. */
  accuracy: number | null;
};

type Props = {
  /** Null before the first fix arrives — the puck renders nothing. */
  fix: PuckFix | null;
  /**
   * True when the newest fix is old enough that we should stop implying it is
   * current. Drawn as reduced opacity, not as a different mark.
   */
  stale?: boolean;
};

/**
 * Below this, iOS is as certain as it ever gets outdoors (±5–15m per the
 * design system) and a ring would be noise on every screen. Above it, the ring
 * is the honest thing to draw: indoors a fix can report 50–165m, which is wider
 * than the unlock radius it is being tested against, and the user deserves to
 * see that rather than a confident dot.
 */
const RING_THRESHOLD_M = 15;

/**
 * Rendering floor only. A sub-metre ring would be invisible; this does not
 * change what we claim about the fix, and there is deliberately no ceiling — a
 * 400m ring that swallows the screen is telling the truth about a 400m fix.
 */
const MIN_RING_M = 8;

const RING_STEPS = 64;
const METRES_PER_DEGREE_LAT = 111_320;

/** Dot geometry, in points. Screen-space, so it does not scale with zoom. */
const DOT_RADIUS_PT = 5;
/**
 * The base-coloured collar is the same trick the cairn glyph uses: contour
 * lines must not read through the mark that sits on top of them.
 */
const DOT_COLLAR_PT = 2;

const STALE_OPACITY = 0.4;

/**
 * A circle of `radiusM` around a point, as a GeoJSON polygon.
 *
 * Why a polygon and not a `CircleLayer` with a radius: `circleRadius` is in
 * screen points, so a fixed value would claim a different real-world accuracy
 * at every zoom level. A polygon is in degrees and therefore stays honest when
 * the user pinches.
 */
function accuracyRing(
  latitude: number,
  longitude: number,
  radiusM: number,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const latRad = (latitude * Math.PI) / 180;
  // Metres per degree of longitude shrinks toward the poles. Clamped so a
  // pathological latitude cannot divide by zero; we are not demoing at a pole.
  const cosLat = Math.max(Math.cos(latRad), 1e-6);

  const dLat = radiusM / METRES_PER_DEGREE_LAT;
  const dLng = radiusM / (METRES_PER_DEGREE_LAT * cosLat);

  const outer: GeoJSON.Position[] = [];
  for (let i = 0; i < RING_STEPS; i += 1) {
    const theta = (i / RING_STEPS) * 2 * Math.PI;
    outer.push([
      longitude + dLng * Math.cos(theta),
      latitude + dLat * Math.sin(theta),
    ]);
  }
  // Close the ring by repeating the first vertex exactly, rather than letting
  // the loop run to 2π and land a float's width away from it.
  const first = outer[0];
  if (first) outer.push(first);

  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [outer] },
  };
}

function dotFeature(
  latitude: number,
  longitude: number,
): GeoJSON.Feature<GeoJSON.Point> {
  return {
    type: 'Feature',
    properties: {},
    // GeoJSON order — [longitude, latitude]. `usePosition()` is the one
    // boundary where the expo-location shape is converted; this file receives
    // the named form and converts once, here, for the wire.
    geometry: { type: 'Point', coordinates: [longitude, latitude] },
  };
}

export function UserPuck({ fix, stale = false }: Props) {
  const latitude = fix?.latitude ?? null;
  const longitude = fix?.longitude ?? null;
  const accuracy = fix?.accuracy ?? null;

  const ringRadiusM =
    accuracy != null && accuracy > RING_THRESHOLD_M
      ? Math.max(accuracy, MIN_RING_M)
      : null;

  // Rebuilding 64 vertices on every render would be cheap, but the shape prop
  // crosses the native bridge — a new object identity re-uploads the source.
  const ring = useMemo(
    () =>
      latitude != null && longitude != null && ringRadiusM != null
        ? accuracyRing(latitude, longitude, ringRadiusM)
        : null,
    [latitude, longitude, ringRadiusM],
  );

  const dot = useMemo(
    () =>
      latitude != null && longitude != null
        ? dotFeature(latitude, longitude)
        : null,
    [latitude, longitude],
  );

  // No fix, no mark. Not a guessed position, not a last-known ghost.
  if (!dot) return null;

  const opacity = stale ? STALE_OPACITY : 1;

  return (
    <>
      {ring ? (
        // Elevation in this app is a 12% hairline over a 6% fill, and that is
        // the whole depth vocabulary. The ring uses it verbatim so it reads as
        // surface rather than as a highlight.
        <ShapeSource id="cairn-user-accuracy-source" shape={ring}>
          <FillLayer
            id="cairn-user-accuracy-fill"
            style={{
              fillColor: colors.contour,
              fillOpacity: 0.06 * opacity,
              fillOutlineColor: colors.hairline,
            }}
          />
        </ShapeSource>
      ) : null}

      {/* Declared after the ring so it draws above it. */}
      <ShapeSource id="cairn-user-puck-source" shape={dot}>
        <CircleLayer
          id="cairn-user-puck-dot"
          style={{
            circleRadius: DOT_RADIUS_PT,
            circleColor: colors.contour,
            circleOpacity: opacity,
            circleStrokeWidth: DOT_COLLAR_PT,
            circleStrokeColor: colors.background,
            circleStrokeOpacity: opacity,
            // Flat map today, but pin the mark to the screen rather than to the
            // ground plane so it cannot turn into an ellipse if pitch is ever
            // enabled.
            circlePitchAlignment: 'viewport',
          }}
        />
      </ShapeSource>
    </>
  );
}

export default UserPuck;
