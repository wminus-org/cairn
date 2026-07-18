/**
 * Mapbox runtime setup.
 *
 * `setAccessToken` must run once, at app boot, before the first MapView
 * mounts. That is the only thing this module does. The contour style, the
 * camera and every layer belong to CRN-006 and are deliberately not here.
 *
 * The pk.* token is a runtime value. The sk.* download token is a build-time
 * CocoaPods credential — if the map renders at all, the sk token has already
 * done its job and there is no reason to look for it here.
 */
import Mapbox from '@rnmapbox/maps';

import { missingEnv } from '../env';

let initialized = false;

/**
 * Safe to call when the token is absent: it warns and no-ops rather than
 * throwing, so the app still boots and the placeholder screen can explain
 * what is missing.
 */
export function initMapbox(): boolean {
  if (initialized) return true;

  const token = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) {
    console.warn(
      '[cairn] EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN is not set — the map will not ' +
        'render. Missing: ' + missingEnv().join(', '),
    );
    return false;
  }

  Mapbox.setAccessToken(token);
  initialized = true;
  return true;
}
