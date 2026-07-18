/**
 * Small geo/format helpers for the library screens. Distances that DECIDE
 * anything come from the server (`distance_m`); `metresBetween` here exists
 * only to throttle refetches — never to gate content.
 */
import type { LatLng } from '../../lib/cairnApi';

/** Rough haversine metres between two coordinates. Throttling only. */
export function metresBetween(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      sinLng *
      sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "120 M" under a kilometre, "1.4 KM" above. Renders the SERVER's number. */
export function formatDistance(distanceM: number): string {
  if (distanceM >= 1000) return `${(distanceM / 1000).toFixed(1)} KM`;
  return `${Math.round(distanceM)} M`;
}

/** "0:12" from seconds. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
