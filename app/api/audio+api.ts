/**
 * The signer. POST { cairnId, stoneId, latitude, longitude } → { url, expiresIn }.
 *
 * This route exists because of one rule the client cannot be trusted with:
 * `cairn-audio` is a PRIVATE bucket and no client may ever call
 * `createSignedUrl` for itself. 0002 is explicit that storage paths are public
 * knowledge — both ids in `{cairn_id}/{stone_id}.m4a` are handed out at 200m,
 * in the `approaching` band, so a client that could sign could reconstruct a key
 * for any stone it has ever seen a stub of and play it from the other side of
 * the city. Path secrecy is not the control. THIS is the control.
 *
 * TWO CLIENTS, AND WHY THEY CANNOT BE ONE:
 *
 *  1. The GATE client — anon key + the caller's own JWT, so RLS and
 *     `auth.uid()` resolve to the caller. `cairn_detail` is called through it,
 *     which means the server re-derives the distance from the cairn's stored
 *     row and the position in this request, and only puts `audio_path` in the
 *     response when band = 'unlocked'. Membership is enforced in the same call:
 *     a non-member gets P0002 'cairn not found'. The gate has to run as the
 *     caller or it is not a gate — a service_role `cairn_detail` would unlock
 *     everything for everyone, because `auth.uid()` would be null and RLS would
 *     not apply.
 *
 *  2. The SIGNING client — service_role, which bypasses RLS entirely. It has to,
 *     because clients deliberately have no select on `storage.objects` and
 *     therefore cannot sign. Nothing but the `createSignedUrl` call below runs
 *     through it, and it never sees a caller-supplied path: the only path it is
 *     given is the one the gate client just returned, in the unlocked band.
 *
 * So the order is load-bearing. Check as the caller, sign as the service. If
 * those two ever collapse into one client, whichever key it holds breaks one
 * half: the anon key cannot sign, and the service key cannot be gated.
 *
 * The service key is read from `process.env.SUPABASE_SERVICE_ROLE_KEY` with NO
 * `EXPO_PUBLIC_` prefix. That prefix is not cosmetic — Metro inlines those
 * values into the JS bundle at build time, so an `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`
 * would ship a full RLS bypass to every device that loads the app. This module
 * only ever runs on the dev server, so a bare name stays on the server.
 */
import { createClient } from '@supabase/supabase-js';

/** Signed URLs live exactly long enough to start playback, and no longer. */
const SIGNED_URL_TTL_SECONDS = 60;

const AUDIO_BUCKET = 'cairn-audio';

interface AudioRequestBody {
  cairnId: string;
  stoneId: string;
  latitude: number;
  longitude: number;
}

export async function POST(request: Request): Promise<Response> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey) {
    return json(500, {
      error: 'server-misconfigured',
      message:
        'EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set in the ' +
        'dev server environment. See supabase/SETUP.md.',
    });
  }

  // Checked before any work, and named in the message, because the failure mode
  // this replaces is a 500 with a supabase-js stack trace that reads like a
  // network problem. It is not a network problem; a line is missing from .env.
  if (!serviceRoleKey) {
    return json(501, {
      error: 'signing-not-configured',
      message:
        'SUPABASE_SERVICE_ROLE_KEY is not set, so audio cannot be signed. Add it to ' +
        '.env WITHOUT the EXPO_PUBLIC_ prefix and restart Metro with --clear. ' +
        'See supabase/SETUP.md, "Audio signing".',
    });
  }

  const accessToken = bearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return json(401, {
      error: 'unauthenticated',
      message: 'Missing Authorization: Bearer <supabase access token>.',
    });
  }

  let body: AudioRequestBody;
  try {
    body = parseBody(await request.json());
  } catch (error) {
    return json(400, { error: 'bad-request', message: String((error as Error).message) });
  }

  // --- 1. The gate, as the caller ------------------------------------------
  //
  // `persistSession: false` / `autoRefreshToken: false` because this client is
  // built per request and thrown away; a server-side client that persisted
  // would be sharing one caller's session across every request the dev server
  // handles.
  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: detail, error: detailError } = await asCaller.rpc('cairn_detail', {
    p_cairn_id: body.cairnId,
    p_lat: body.latitude,
    p_lng: body.longitude,
  });

  if (detailError) {
    // P0002 'cairn not found' covers "does not exist" and "not your Space"
    // alike, deliberately indistinguishable. Everything else the gate raises
    // ('position required', 'not authenticated') is also a refusal from this
    // route's point of view, so they all land on the same denial below rather
    // than being echoed back — an error string that distinguishes them here
    // would hand back exactly what 0004 refuses to confirm.
    return denied();
  }

  const stones = (detail as { band?: string; stones?: unknown[] } | null) ?? null;
  if (!stones || stones.band !== 'unlocked') return denied();

  const stone = (stones.stones ?? []).find(
    (candidate): candidate is { id: string; audio_path?: string | null } =>
      typeof candidate === 'object' &&
      candidate !== null &&
      (candidate as { id?: unknown }).id === body.stoneId,
  );

  // A stone id that is not in this cairn's unlocked stone list gets nothing.
  // Without this check, standing at any one cairn would let you sign audio
  // belonging to any other, since the gate only proves you are at THIS cairn.
  if (!stone) return denied();

  const audioPath = stone.audio_path;
  if (!audioPath) {
    return json(404, { error: 'no-audio', message: 'That stone has no audio.' });
  }

  // Second, independent check on the one operation that can leak another
  // cairn's audio, exactly as 0004_proximity_gate.sql asks the signer to do.
  // The RPC derives this path from `s.cairn_id`, so this can only fire if the
  // RPC is wrong — and if it ever goes back to echoing a stored column, this is
  // what keeps a decoy cairn from pointing the signer at someone else's stone.
  if (!audioPath.startsWith(`${body.cairnId}/`)) return denied();

  // --- 2. The signature, as service_role -----------------------------------
  //
  // Reached only on the unlocked path, and only with a path the gate itself
  // returned and this route just re-checked. This client never touches
  // `cairn_detail` and never sees a caller-supplied string.
  const asService = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: signed, error: signError } = await asService.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(audioPath, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    // The usual cause is an orphaned stone row whose object never landed — see
    // the partial-failure notes on `dropVoiceCairn` in src/lib/cairnApi.ts.
    return json(502, {
      error: 'sign-failed',
      message: signError?.message ?? 'Storage returned no signed URL.',
    });
  }

  return json(200, { url: signed.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS });
}

/**
 * One shape for every refusal: not unlocked, not a member, no such cairn, wrong
 * stone. Same status, same body. Telling them apart is precisely the leak the
 * gate is built to avoid.
 */
function denied(): Response {
  return json(403, {
    error: 'not-unlocked',
    message: 'Walk to the cairn to hear this.',
  });
}

function json(status: number, payload: unknown): Response {
  return Response.json(payload, { status });
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

function parseBody(value: unknown): AudioRequestBody {
  const raw = value as Partial<Record<keyof AudioRequestBody, unknown>> | null;
  const cairnId = raw?.cairnId;
  const stoneId = raw?.stoneId;
  const latitude = raw?.latitude;
  const longitude = raw?.longitude;

  if (typeof cairnId !== 'string' || !cairnId) throw new Error('cairnId is required.');
  if (typeof stoneId !== 'string' || !stoneId) throw new Error('stoneId is required.');
  // Position is required and never defaulted. A missing coordinate must not
  // become 0,0 — that is a real place in the Atlantic and it would be inside
  // nothing, but relying on that is how a gate quietly stops gating.
  if (typeof latitude !== 'number' || !Number.isFinite(latitude)) {
    throw new Error('latitude must be a number.');
  }
  if (typeof longitude !== 'number' || !Number.isFinite(longitude)) {
    throw new Error('longitude must be a number.');
  }

  return { cairnId, stoneId, latitude, longitude };
}
