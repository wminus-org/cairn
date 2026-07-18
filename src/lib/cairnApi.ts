/**
 * The proximity RPC boundary. THIS IS THE ONLY MODULE THAT MAY CALL
 * `supabase.rpc('cairns_nearby' | 'cairn_detail' | 'stack_stone', …)`.
 *
 * Everything the map (CRN-006/007), the thread (CRN-016), Nearby (CRN-024) and
 * stacking (CRN-017) know about the server comes through here. Rules that only
 * hold if that stays true:
 *
 *  - **Never re-derive `band` or distance on the client to decide what to show.**
 *    0004_proximity_gate.sql computes both from the cairn's own stored row. The
 *    client sends a position; the server decides. A second client-side gate is
 *    how you end up rendering an unlock the server did not grant, or the
 *    reverse, on stage.
 *  - **Never hardcode 30m.** `radius_m` is per cairn and arrives on every
 *    summary and every detail. CRN-015's blur curve reads it from there.
 *  - **A non-member asking about a Space cairn is normal, not exceptional.**
 *    The server raises `cairn not found` (P0002) for "does not exist" and "not
 *    yours" alike — deliberately indistinguishable, since a separate 403 would
 *    confirm the cairn exists. `fetchCairnDetail` turns that into `null`, which
 *    means "not visible to you". Do not catch P0002 anywhere else.
 *  - **What comes back for media is a PATH, not a URL** (`audio_path`,
 *    `image_path`), and only in the `unlocked` band. Do not feed a path to an
 *    audio player. Signing is CRN-005's Edge Function; when it lands it adds
 *    `audio_url` / `image_url` alongside, and the optional fields below are
 *    already shaped for it.
 *
 * Positions are `{ latitude, longitude }` throughout — the same shape
 * `usePosition()` hands out, so a caller passes `coords` straight in. The one
 * place lat/lng flips to Mapbox's `[lng, lat]` is in usePosition.ts.
 */
import type { CairnMarker, StoneKind } from './database.types';
import { ensureSession, getSupabase } from './supabase';

// --- Positions --------------------------------------------------------------

/** Caller position, in the order `expo-location` reports it. Never `[lng, lat]`. */
export interface LatLng {
  latitude: number;
  longitude: number;
}

// --- Tier 1: cairns_nearby --------------------------------------------------

/**
 * One row of `cairns_nearby`. Structurally identical to `CairnMarker` in
 * database.types.ts and aliased rather than redeclared, so there is exactly one
 * definition of "what a client may hold about a cairn it is not standing at".
 *
 * Note what is absent: no stones, no kinds, no paths, no transcripts. The RPC
 * cannot return them — grep 0004 for `audio` inside `cairns_nearby` and there
 * is nothing to find. If a field is ever added here, it has to be added to the
 * SQL first, and the question to ask is whether a judge with the network
 * inspector open would be happy about it.
 */
export type CairnSummary = CairnMarker;

export interface NearbyOptions {
  /** Viewport cull only — NOT the unlock check. Server default is 5000m. */
  maxMeters?: number;
}

/**
 * Cairns the caller is entitled to see, nearest first, with distances already
 * rounded to whole metres server-side (float noise under a glyph looks broken
 * on a projector).
 *
 * Membership filtering happens inside the RPC. A Space cairn you do not belong
 * to is simply absent from this array — not a locked marker, not a padlock,
 * absent. Rendering "n hidden nearby" would leak exactly what CRN-020 exists to
 * hide.
 */
export async function fetchNearbyCairns(
  position: LatLng,
  options: NearbyOptions = {},
): Promise<CairnSummary[]> {
  await ensureSession();

  const { data, error } = await getSupabase().rpc('cairns_nearby', {
    p_lat: position.latitude,
    p_lng: position.longitude,
    // Explicit rather than relying on the SQL default: Supabase matches
    // overloads by argument name, and always sending the same three names
    // keeps PostgREST from having to guess.
    p_max_m: options.maxMeters ?? DEFAULT_MAX_METERS,
  });

  if (error) throw toCairnApiError(error, 'cairns_nearby');
  return (data ?? []) as CairnSummary[];
}

/** Matches the `p_max_m` default in 0004_proximity_gate.sql. */
export const DEFAULT_MAX_METERS = 5000;

/**
 * The outer edge of the blur band, from PLAN.md, mirrored here for CRN-015's
 * curve. It is NOT per-cairn (only `radius_m` is) and it is NOT the gate — the
 * server has already decided `band` by the time you see it. Use this to map a
 * distance onto a blur radius, never to decide whether something is unlocked.
 */
export const APPROACH_METERS = 200;

// --- Tier 2: cairn_detail ---------------------------------------------------

/**
 * Derived server-side from the caller's position against the cairn's stored
 * row. The client never sends this and never computes it.
 *
 *  - `far`          — beyond 200m. `stones` is empty. A glyph and a number.
 *  - `approaching`  — inside 200m, outside `radius_m`. `stones` holds stubs:
 *                     five keys, no content, enough to draw the right number of
 *                     blurred cards with the right bylines in the right order.
 *  - `unlocked`     — inside `radius_m`. Paths, transcripts, pins, briefing.
 */
export type ProximityBand = 'far' | 'approaching' | 'unlocked';

/** A pin on a photo stone. Only ever present in the `unlocked` band. */
export interface StonePin {
  id: string;
  /** Normalized 0–1 across the image. NEVER pixels. */
  x: number;
  /** Normalized 0–1 down the image. NEVER pixels. */
  y: number;
  note_text: string | null;
  transcript: string | null;
  /** Renders terracotta `#C0563A` instead of amber. */
  unresolved: boolean;
  /** Storage object path in `cairn-audio`. Sign it before playing it. */
  audio_path: string | null;
  created_at: string;
  /** Added by the signing Edge Function (CRN-005). Absent straight off the RPC. */
  audio_url?: string | null;
}

/**
 * A stone as it arrives from `cairn_detail`, across all three bands.
 *
 * The first four fields are present in `approaching` and `unlocked` alike; the
 * gated fields are optional because in `approaching` the keys **do not exist at
 * all** — the server builds a five-key object, it does not build a full one and
 * null the sensitive parts. Treat `undefined` here as "the server withheld
 * this", not "this stone has no audio", and never let the difference reach the
 * UI: check the band, or use `isUnlocked()`.
 *
 * `pin_count` is the approaching-band stub; `pins` is the unlocked array. Use
 * `stonePinCount()` rather than reaching for either directly.
 */
export interface CairnStone {
  id: string;
  kind: StoneKind;
  author_name: string;
  created_at: string;
  /** Stub band only. */
  pin_count?: number;
  /** Unlocked band only. */
  pins?: StonePin[];
  body_text?: string | null;
  transcript?: string | null;
  /** Storage object path in `cairn-audio`, not a URL. Unlocked band only. */
  audio_path?: string | null;
  /** Storage object path in `cairn-images`, not a URL. Unlocked band only. */
  image_path?: string | null;
  image_aspect_ratio?: number | null;
  /** Added by the signing Edge Function (CRN-005). Absent straight off the RPC. */
  audio_url?: string | null;
  /** Added by the signing Edge Function (CRN-005). Absent straight off the RPC. */
  image_url?: string | null;
}

/** A stone the server has released in full. See `isUnlocked()`. */
export interface UnlockedStone extends CairnStone {
  pins: StonePin[];
  body_text: string | null;
  transcript: string | null;
  audio_path: string | null;
  image_path: string | null;
  image_aspect_ratio: number | null;
}

/** The "Brief me" synthesis (CRN-023). Unlocked band only. */
export interface CairnBriefing {
  generated_at: string;
  summary_text: string | null;
  /** Storage object path in `cairn-audio`. */
  audio_path: string | null;
  /** Added by the signing Edge Function (CRN-005). */
  audio_url?: string | null;
}

/**
 * The `cairn_detail` jsonb, typed. `distance_m` and `band` are the server's
 * numbers — render those, do not recompute them from `usePosition()`, or the
 * label and the gate will disagree by a metre at the worst possible moment.
 */
export interface CairnDetail {
  id: string;
  title: string | null;
  space_id: string | null;
  lat: number;
  lng: number;
  /** Per-cairn unlock radius. Read it. Never hardcode 30. */
  radius_m: number;
  stone_count: number;
  distance_m: number;
  band: ProximityBand;
  stones: CairnStone[];
  briefing: CairnBriefing | null;
}

/** A detail response the server has released in full. */
export interface UnlockedCairnDetail extends CairnDetail {
  band: 'unlocked';
  stones: UnlockedStone[];
}

/**
 * The only sanctioned way to ask "may I play this?". Narrows the whole detail
 * at once, which is why it reads `band` and nothing else: the band is the
 * server's answer, and a stone-by-stone check would invite someone to test
 * `audio_path != null` instead — true for a stub only if the server ever leaks
 * one, which is precisely the bug you would not catch.
 */
export function isUnlocked(detail: CairnDetail): detail is UnlockedCairnDetail {
  return detail.band === 'unlocked';
}

/** Works in every band: unlocked stones carry `pins`, stubs carry `pin_count`. */
export function stonePinCount(stone: CairnStone): number {
  return stone.pins?.length ?? stone.pin_count ?? 0;
}

/**
 * The gate call. Returns `null` when the cairn is not visible to this caller —
 * either it does not exist or it belongs to a Space they are not in, and the
 * server refuses to say which.
 *
 * `null` is a normal result, not an error: the map holds ids from a previous
 * fetch, a deep link can be stale, and a demo phone signed in as the wrong
 * anonymous user is a Tuesday. Render "nothing here" and move on. Genuine
 * failures — no session, no position, network down — still throw.
 *
 * Call this on a position change with some restraint. It is one round trip per
 * call and CRN-025 drives the position at ~1Hz; a thread screen that refetches
 * on every tick will hammer it. Throttle at the call site.
 */
export async function fetchCairnDetail(
  cairnId: string,
  position: LatLng,
): Promise<CairnDetail | null> {
  await ensureSession();

  const { data, error } = await getSupabase().rpc('cairn_detail', {
    p_cairn_id: cairnId,
    p_lat: position.latitude,
    p_lng: position.longitude,
  });

  if (error) {
    const failure = toCairnApiError(error, 'cairn_detail');
    if (failure.kind === 'not-found') return null;
    throw failure;
  }
  if (!data) return null;

  return data as CairnDetail;
}

// --- Write path: stack_stone ------------------------------------------------

/**
 * Everything `stack_stone` accepts. There is no author field and there never
 * will be — identity comes from `auth.uid()` inside the function. Position is
 * an input; identity never is.
 *
 * Order of operations for media (from 0002_storage.sql): mint the stone id
 * client-side is NOT how this one works — `stack_stone` returns the id. Upload
 * to a temporary key or upload first and pass the path here; do not try to
 * `.insert().select()` on `stones`, which fails because there is no select
 * policy by design.
 */
export interface StackStoneInput {
  cairnId: string;
  kind: StoneKind;
  /** The caller's position. The server re-checks it against `radius_m`. */
  position: LatLng;
  bodyText?: string | null;
  /** Storage object path, never a signed URL. */
  audioPath?: string | null;
  /** Storage object path, never a signed URL. */
  imagePath?: string | null;
  imageAspectRatio?: number | null;
  transcript?: string | null;
}

/**
 * Adds a stone to a cairn and returns the new stone id.
 *
 * Read access is not write access: the server re-derives distance here too, so
 * a walker who drifts out of range mid-recording gets `too far from cairn`.
 * That surfaces as a `CairnApiError` with `kind: 'too-far'` — catch it and say
 * "walk back to the cairn" in terracotta, do not show a Postgres string.
 */
export async function stackStone(input: StackStoneInput): Promise<string> {
  await ensureSession();

  const { data, error } = await getSupabase().rpc('stack_stone', {
    // All nine arguments, every time. The function has defaults, but PostgREST
    // resolves overloads by the exact set of argument names it is given, and a
    // partial set is how you get PGRST202/PGRST203 ("function not found") for a
    // function that plainly exists.
    p_cairn_id: input.cairnId,
    p_kind: input.kind,
    p_lat: input.position.latitude,
    p_lng: input.position.longitude,
    p_body_text: input.bodyText ?? null,
    p_audio_path: input.audioPath ?? null,
    p_image_path: input.imagePath ?? null,
    p_image_aspect_ratio: input.imageAspectRatio ?? null,
    p_transcript: input.transcript ?? null,
  });

  if (error) throw toCairnApiError(error, 'stack_stone');
  if (typeof data !== 'string') {
    throw new CairnApiError('stack_stone returned no stone id.', 'unknown', 'stack_stone');
  }
  return data;
}

// --- Errors -----------------------------------------------------------------

/**
 * The failures the gate raises on purpose, named so a screen can render them
 * without string-matching Postgres.
 *
 *  - `not-found`         — P0002. Does not exist, or not your Space. Same error
 *                          for both, deliberately. `fetchCairnDetail` absorbs it.
 *  - `too-far`           — P0001 from `stack_stone`. You walked out of range.
 *  - `position-required` — P0001 with no position. Fail-closed, not a bug in
 *                          the server: something called an RPC before a fix
 *                          arrived. Wait for `usePosition().coords`.
 *  - `unauthenticated`   — 28000. `ensureSession()` has not resolved, or the
 *                          token expired while the phone was locked.
 *  - `unknown`           — everything else, including the network.
 */
export type CairnApiErrorKind =
  | 'not-found'
  | 'too-far'
  | 'position-required'
  | 'unauthenticated'
  | 'unknown';

export class CairnApiError extends Error {
  readonly kind: CairnApiErrorKind;
  /** Which RPC failed, so a log line says something useful. */
  readonly rpc: string;
  /** The raw PostgREST/Postgres code, when there was one. */
  readonly code: string | null;

  constructor(message: string, kind: CairnApiErrorKind, rpc: string, code: string | null = null) {
    super(message);
    this.name = 'CairnApiError';
    this.kind = kind;
    this.rpc = rpc;
    this.code = code;
    // Subclassing Error survives Hermes, but this line is free and keeps
    // `instanceof` honest under any downlevel transform.
    Object.setPrototypeOf(this, CairnApiError.prototype);
  }
}

export function isCairnApiError(value: unknown): value is CairnApiError {
  return value instanceof CairnApiError;
}

/**
 * Classifies by message text as well as SQLSTATE, because the gate uses P0001
 * for two different situations ("position required" and "too far from cairn")
 * and the message is the only thing that separates them. Both strings are
 * literals in 0004_proximity_gate.sql; if either is reworded there, reword it
 * here in the same commit.
 */
function toCairnApiError(error: unknown, rpc: string): CairnApiError {
  const source = error as { message?: unknown; code?: unknown } | null;
  const message = typeof source?.message === 'string' ? source.message : String(error);
  const code = typeof source?.code === 'string' ? source.code : null;
  const text = message.toLowerCase();

  let kind: CairnApiErrorKind = 'unknown';
  if (text.includes('cairn not found')) kind = 'not-found';
  else if (text.includes('too far from cairn')) kind = 'too-far';
  else if (text.includes('position required')) kind = 'position-required';
  else if (text.includes('not authenticated') || code === '28000') kind = 'unauthenticated';

  return new CairnApiError(message, kind, rpc, code);
}
