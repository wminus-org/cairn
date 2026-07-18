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
import { ensureSession, getSupabase, storageKeys, uploadToBucket } from './supabase';

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
 * ORDER OF OPERATIONS FOR MEDIA — mint, upload, then call. The doc comment
 * here used to say `stack_stone` returns the id and you must therefore upload
 * afterwards. That is no longer true and has not been since 0004 grew a tenth
 * parameter: `p_stone_id` is CLIENT-MINTED. Read the function body — it does
 * `coalesce(p_stone_id, gen_random_uuid())`, rebuilds the canonical key from
 * `p_cairn_id` and that id, and then `raise exception 'audio path must be %'`
 * if the path you passed is not character-for-character the key it derived. So
 * the id has to exist before the upload, which is the whole reason the
 * parameter is there. `p_stone_id` is REQUIRED whenever a media path is given;
 * a text stone may omit it and let the server mint one.
 *
 * Still true: do not `.insert().select()` on `stones`. There is no select
 * policy by design, and there is no insert privilege either.
 */
export interface StackStoneInput {
  cairnId: string;
  kind: StoneKind;
  /** The caller's position. The server re-checks it against `radius_m`. */
  position: LatLng;
  /**
   * Mint with `newStoneId()` BEFORE uploading, and pass the same value here.
   * Required if `audioPath` or `imagePath` is set; omit it for a text stone.
   */
  stoneId?: string | null;
  bodyText?: string | null;
  /** Storage object path, never a signed URL. Must equal `storageKeys.stoneAudio(cairnId, stoneId)`. */
  audioPath?: string | null;
  /** Storage object path, never a signed URL. Must equal `storageKeys.stoneImage(cairnId, stoneId)`. */
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
    // All TEN arguments, every time — 0004 drops the 9-arg signature and
    // creates a 10-arg one ending in `p_stone_id`. The function has defaults,
    // but PostgREST resolves overloads by the exact set of argument names it is
    // given, and a partial set is how you get PGRST202/PGRST203 ("function not
    // found") for a function that plainly exists.
    p_cairn_id: input.cairnId,
    p_kind: input.kind,
    p_lat: input.position.latitude,
    p_lng: input.position.longitude,
    p_body_text: input.bodyText ?? null,
    p_audio_path: input.audioPath ?? null,
    p_image_path: input.imagePath ?? null,
    p_image_aspect_ratio: input.imageAspectRatio ?? null,
    p_transcript: input.transcript ?? null,
    p_stone_id: input.stoneId ?? null,
  });

  if (error) throw toCairnApiError(error, 'stack_stone');
  if (typeof data !== 'string') {
    throw new CairnApiError('stack_stone returned no stone id.', 'unknown', 'stack_stone');
  }
  return data;
}

// --- Write path: dropping a cairn -------------------------------------------

/**
 * A stone/cairn id, minted client-side.
 *
 * Hand-rolled because there is no CSPRNG to reach for: `expo-crypto` is not a
 * dependency, `react-native-get-random-values` is not a dependency, Hermes
 * ships no `crypto` global of its own, and Expo SDK 54's winter runtime
 * polyfills `fetch`/`URL`/`TextDecoder` but not Web Crypto. `uuid` is in
 * node_modules only as somebody else's transitive dependency, which is not a
 * thing to build a write path on. Adding a package is off the table — this
 * runs in Expo Go.
 *
 * So: use `getRandomValues` if some future dependency provides it, and fall
 * back to `Math.random`. That fallback is NOT cryptographic, and it does not
 * need to be. These ids are not secrets and not capabilities — 0002 is explicit
 * that storage paths are public knowledge and that the signer, not path
 * secrecy, is the control. All this has to do is not collide.
 */
export function newStoneId(): string {
  const bytes = new Uint8Array(16);
  const webCrypto = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => void } })
    .crypto;
  if (typeof webCrypto?.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  // Version 4, variant 10xx. The SQL casts the first path segment to ::uuid
  // behind a regex, so a malformed id is an RLS violation, not a soft failure.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i += 1) hex.push(bytes[i].toString(16).padStart(2, '0'));
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}

export interface CreateCairnInput {
  latitude: number;
  longitude: number;
  title?: string | null;
  /** `null`/omitted means a PERSONAL cairn — public, gated by proximity alone. */
  spaceId?: string | null;
}

/**
 * Drops a cairn at a position and returns its id.
 *
 * A plain insert is correct here, and it is the ONLY direct client write left
 * in the schema. 0004 backs it with both halves that a write needs:
 *   - `grant insert on public.cairns to authenticated` — annotated in the file
 *     as "the ONLY direct client write left". Without the grant the statement
 *     is refused before any policy runs.
 *   - policy "cairns insert own", `with check (created_by = auth.uid() and
 *     (space_id is null or is_space_member(space_id)))`. So `created_by` must
 *     be this session's user — it is not optional and it is not defaultable,
 *     an insert omitting it fails the check rather than being filled in.
 *
 * TWO THINGS THE POLICY SET DOES NOT GIVE, both load-bearing here:
 *   - No select policy on `cairns`, so `.insert(row).select()` FAILS. Hence the
 *     id is minted client-side and returned from a variable, not read back.
 *   - `radius_m` is left out entirely so the column default (30) applies.
 *     Sending it would be a client deciding its own unlock radius.
 */
export async function createCairn(input: CreateCairnInput): Promise<string> {
  const session = await ensureSession();

  const id = newStoneId();

  const { error } = await getSupabase().from('cairns').insert({
    id,
    lat: input.latitude,
    lng: input.longitude,
    title: input.title ?? null,
    space_id: input.spaceId ?? null,
    created_by: session.user.id,
  });

  if (error) throw toCairnApiError(error, 'cairns.insert');
  return id;
}

/**
 * Uploads a recording to `cairn-audio` at the key `stack_stone` is going to
 * rebuild for itself, and returns that key.
 *
 * Delegates to `uploadToBucket()` rather than reimplementing the upload: RN
 * cannot hand a `file://` URI to supabase-js as a Blob or as
 * `{ uri, type, name }` — both "succeed" and write a 0-byte object, which
 * passes every check except playback. That helper reads the file to base64 and
 * decodes it to an ArrayBuffer with `base64-arraybuffer`, and refuses to
 * upload zero bytes. `audio/mp4` is explicit because expo-audio writes `.m4a`
 * and an object that lands as `application/octet-stream` will not play on iOS.
 *
 * The key is `storageKeys.stoneAudio()` and nothing else. `stack_stone`
 * compares the path you pass it against its own derivation and raises
 * 'audio path must be %' on a mismatch, so an upload to a hand-built key fails
 * loudly at the RPC instead of becoming a stone that mysteriously will not
 * play. Storage's own "cairn media insert" policy also requires the first path
 * segment to be a uuid, which is what keeps clients out of `briefings/`.
 */
export async function uploadStoneAudio(
  cairnId: string,
  stoneId: string,
  localAudioUri: string,
): Promise<string> {
  await ensureSession();

  const key = storageKeys.stoneAudio(cairnId, stoneId);
  try {
    return await uploadToBucket(localAudioUri, 'cairn-audio', key, 'audio/mp4');
  } catch (error) {
    // Storage failures arrive as StorageError, not a Postgres error, so they
    // classify as 'unknown' — which is honest. A 403 here means the "cairn
    // media insert" policy rejected the key shape, not that the network died.
    throw toCairnApiError(error, 'storage.cairn-audio');
  }
}

/** What a completed drop leaves behind. */
export interface DroppedCairn {
  cairnId: string;
  stoneId: string;
  /** Storage object path. NOT playable — signing is CRN-005's Edge Function. */
  audioPath: string | null;
}

export interface DropVoiceCairnInput {
  /** Where the walker is standing. This becomes the cairn's position AND the proximity proof. */
  position: LatLng;
  /** `file://` URI from expo-audio. */
  audioUri: string;
  title?: string | null;
  spaceId?: string | null;
  transcript?: string | null;
  /**
   * Accepted and then dropped on the floor, deliberately. `stones` has no
   * duration column and `stack_stone` has no parameter for one, so there is
   * nowhere for this to go — persisting it means a migration plus a tenth
   * argument on the RPC, not a change here. It is in the type because the
   * recorder already knows the number and passing it costs nothing; the day
   * the column exists, this is the one place that has to change.
   */
  durationMs?: number | null;
}

/**
 * The whole drop, end to end: cairn, then stone id, then upload, then stone.
 *
 * ORDER, AND WHY IT IS THIS ONE. 0004's `stack_stone` takes `p_stone_id` and
 * validates the media path against a key it rebuilds from `p_cairn_id` and
 * that id. It does not return a path and it does not accept one on trust. So
 * "call the RPC first to mint the id, then upload" is not an option the SQL
 * offers — by the time the RPC returns, the row already carries a path, and
 * there is no update policy on `stones` to correct it with (the old
 * `stones update own` policy was deliberately dropped as a confused-deputy
 * hole). The file says it in as many words: "Generate the row id on the client
 * with crypto.randomUUID(), upload to the key derived from it, THEN call
 * stack_stone(..., p_stone_id)." That is what this does.
 *
 * The upload deliberately goes BEFORE the RPC. A stone row whose object does
 * not exist yet renders as a broken player; an object with no stone row
 * renders as nothing at all. Failing in the harmless direction is the point.
 *
 * WHAT PARTIAL FAILURE LEAVES BEHIND, since this is three writes and not a
 * transaction:
 *   - createCairn throws  — nothing exists. Clean.
 *   - upload throws       — an EMPTY cairn sits on the map with stone_count 0.
 *                           Recoverable and worth recovering: keep `cairnId`
 *                           and retry `stackVoiceStone()` against it rather
 *                           than dropping a second cairn a metre away.
 *   - stack_stone throws  — an ORPHAN OBJECT at {cairn}/{stone}.m4a, plus the
 *                           empty cairn. Not recoverable automatically, and it
 *                           does not need to be: with no stone row,
 *                           cairn_detail never derives that path (it reads the
 *                           column only for null-ness), so nothing can ever ask
 *                           the signer for it. It is invisible garbage in a
 *                           private bucket. A retry mints a NEW stone id and a
 *                           new key; the old object is simply left. Do not
 *                           reuse the failed stone id to "clean up" — the
 *                           common cause of this branch is 'too far from cairn'
 *                           after drifting mid-recording, and the fix for that
 *                           is walking back, not deleting anything.
 *
 * Single-flight: a double-tapped drop button would otherwise plant two cairns
 * a metre apart and stack one stone on each. Concurrent callers share the
 * in-flight promise instead. Note what that means — a second call made while
 * the first is still running gets the FIRST call's cairn id, whatever it
 * asked for. That is right for a double tap and wrong for two genuinely
 * different drops, which is a trade this app can make because a walker cannot
 * be in two places at once. A retry after a failure is unaffected: the promise
 * has settled and the slot is clear by then.
 *
 * Returns the cairn id, which is what the map needs to recentre and open the
 * new cairn. Use `stackVoiceStone()` directly if you also need the stone id.
 */
export function dropVoiceCairn(input: DropVoiceCairnInput): Promise<string> {
  return singleFlightDrop(async () => {
    const cairnId = await createCairn({
      latitude: input.position.latitude,
      longitude: input.position.longitude,
      title: input.title ?? null,
      spaceId: input.spaceId ?? null,
    });

    await stackVoiceStone(cairnId, input);
    return cairnId;
  });
}

/**
 * The stone half of `dropVoiceCairn`, split out so a failed upload can be
 * retried against the cairn that already exists.
 *
 * Note the position goes to `stack_stone` unchanged. The cairn was just
 * dropped at this exact point, so the server's re-derived distance is ~0 and
 * comfortably inside the default 30m — but it is still the server's number,
 * and drifting far enough between the two calls genuinely should fail.
 */
export async function stackVoiceStone(
  cairnId: string,
  input: Omit<DropVoiceCairnInput, 'title' | 'spaceId'>,
): Promise<DroppedCairn> {
  const stoneId = newStoneId();
  const audioPath = await uploadStoneAudio(cairnId, stoneId, input.audioUri);

  await stackStone({
    cairnId,
    kind: 'voice',
    position: input.position,
    stoneId,
    audioPath,
    transcript: input.transcript ?? null,
  });

  return { cairnId, stoneId, audioPath };
}

export interface DropTextCairnInput {
  position: LatLng;
  bodyText: string;
  title?: string | null;
  spaceId?: string | null;
}

/**
 * The same flow with no upload in it: cairn, then stone. Two round trips, no
 * storage, no key derivation, no `p_stone_id` — a text stone lets the server
 * mint its own id, which is the branch `coalesce(p_stone_id, gen_random_uuid())`
 * exists for.
 *
 * This is the fastest way to prove the loop end to end. If a text drop appears
 * on the map and a voice drop does not, the fault is in the upload or the key,
 * not in auth, the insert policy, the RPC or the proximity gate.
 */
export function dropTextCairn(input: DropTextCairnInput): Promise<string> {
  return singleFlightDrop(async () => {
    const body = input.bodyText.trim();
    if (!body) {
      throw new CairnApiError('Refusing to stack an empty text stone.', 'unknown', 'stack_stone');
    }

    const cairnId = await createCairn({
      latitude: input.position.latitude,
      longitude: input.position.longitude,
      title: input.title ?? null,
      spaceId: input.spaceId ?? null,
    });

    await stackStone({
      cairnId,
      kind: 'text',
      position: input.position,
      bodyText: body,
    });

    return cairnId;
  });
}

/**
 * One drop at a time, app-wide. Shared between the voice and text paths on
 * purpose: they both plant a cairn, and two of those from one gesture is the
 * failure that is embarrassing on stage rather than merely wrong.
 */
let inFlightDrop: Promise<string> | null = null;

function singleFlightDrop(run: () => Promise<string>): Promise<string> {
  if (inFlightDrop) return inFlightDrop;

  const attempt = run().finally(() => {
    inFlightDrop = null;
  });
  inFlightDrop = attempt;
  return attempt;
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
