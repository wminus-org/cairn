/**
 * How the thread *renders* a distance. Not how it decides one.
 *
 * Every function here takes numbers the server already sent (`distance_m`,
 * `radius_m`, `band`) and turns them into a blur intensity, an opacity or a
 * string. None of them decides whether content is visible — `cairn_detail` did
 * that before the payload left Postgres, and in the approach band there is
 * genuinely nothing to reveal. Blur is a treatment applied to a stack the
 * client synthesised itself; it is never a fetch decision.
 */
import { proximity } from '../theme';

/**
 * `0` at the 200m outer edge, `1` at the cairn's own unlock radius.
 *
 * `radius_m` comes off the response per cairn. Hardcoding 30 here would make a
 * seeded 80m meeting-room cairn render as though it unlocked at 30 and the blur
 * would still be at 60% the moment the server said `unlocked`, which reads as a
 * bug on stage.
 */
export function approachProgress(distanceM: number, radiusM: number): number {
  const span = proximity.previewRadiusM - radiusM;
  // A cairn with a radius at or beyond the outer edge has no band to ramp
  // across; treat it as fully sharp rather than dividing by zero.
  if (span <= 0) return 1;
  const t = (proximity.previewRadiusM - distanceM) / span;
  return Math.min(1, Math.max(0, t));
}

/** expo-blur `intensity`, 0–100. 90 at 200m, 0 at the unlock radius. */
export function blurIntensity(t: number): number {
  return Math.round(90 * (1 - t));
}

/**
 * The synthesised stack fades in over 200 → 180m so that crossing the outer
 * edge is a fade rather than a pop. If you can see the boundary as a jump, the
 * mechanic reads as a state machine instead of as walking.
 */
export function stackOpacity(t: number): number {
  return Math.min(1, Math.max(0, t * 8.5));
}

/**
 * Distance, mono, uppercase. `HERE` is the unlocked band's label and the only
 * amber string on this screen — and it keys off `band`, never off comparing
 * `distance_m` to `radius_m` ourselves, so the word and the content it promises
 * can never disagree.
 */
export function formatDistance(distanceM: number): string {
  if (distanceM >= 1000) return `${(distanceM / 1000).toFixed(1)} KM`;
  return `${Math.round(distanceM)} M`;
}

/** How much further to walk before the server will release this cairn. */
export function metresToGo(distanceM: number, radiusM: number): number {
  return Math.max(0, Math.round(distanceM - radiusM));
}

const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

/**
 * `12 APR · 09:14`. Absolute, always.
 *
 * "3 months ago" collapses the exact thing the demo is selling — a conversation
 * held at one coordinate across a season. Relative time is banned here.
 */
export function formatStoneTimestamp(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const day = String(at.getDate()).padStart(2, '0');
  const hours = String(at.getHours()).padStart(2, '0');
  const minutes = String(at.getMinutes()).padStart(2, '0');
  return `${day} ${MONTHS[at.getMonth()]} · ${hours}:${minutes}`;
}
