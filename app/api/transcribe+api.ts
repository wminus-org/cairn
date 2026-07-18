/**
 * POST /api/transcribe — CRN-022. Voice stone → text, into `stones.transcript`.
 *
 * An Expo Router API route rather than the Supabase Edge Function the ticket
 * describes, for the same reason the signing route is one: the phone already
 * holds an open connection to the Metro dev server, so this ships by saving a
 * file instead of by `supabase functions deploy` at 15:20 on venue wifi. The
 * property that mattered is preserved — the STT key lives in the server's
 * process environment and is never inlined into the bundle. Nothing here is
 * prefixed EXPO_PUBLIC_ and nothing here may ever be.
 *
 * WHY ELEVENLABS SCRIBE AND NOT APPLE'S ON-DEVICE SPEECH. Not a shopping
 * preference. `SFSpeechRecognizer` has 64 dictation locales and iOS 26's
 * `SpeechTranscriber` has 42, and neither list contains `sl-SI` — Slovenian is
 * an iOS keyboard language, which is localization, not recognition. The audio
 * recorded at this hackathon is Slovenian. See reference/on-device-ai.md; that
 * question is settled, do not reopen it.
 *
 * THE GATE APPLIES HERE TOO. This route holds the service_role key, so it can
 * read any object in a private bucket — which makes an unauthenticated
 * `{ cairnId, stoneId }` endpoint a way to launder audio out of a cairn you are
 * standing 500m from, in text form, without ever passing the proximity check.
 * So before any of that happens it calls `cairn_detail` AS THE CALLER, using
 * their own JWT and their own claimed position, and requires band `unlocked`
 * plus the stone actually being in the released array. If they could not have
 * heard it, they do not get to read it. The service_role client is constructed
 * only after that check passes, and only ever addresses the path the RPC itself
 * derived.
 *
 * FAILURE IS ALWAYS SOFT, AND THAT IS THE POINT (CRN-022's acceptance criteria
 * time it with a stopwatch). Nothing in the capture path awaits this. A stone
 * appears on the map and plays the moment `stack_stone` returns; the transcript
 * arrives later or never. `transcript = null` is the whole state machine — no
 * status column, no retry queue, no spinner. A dead key, a 500 from ElevenLabs
 * or a timeout must never turn into a failed upload or a failed drop, so every
 * error here returns a status the caller is expected to discard.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Matches `storageKeys.stoneAudio()`; the RPC derives the same key server-side. */
const AUDIO_BUCKET = 'cairn-audio';

/** Scribe's general model. `scribe_v1_experimental` exists; this one is the stable id. */
const SCRIBE_MODEL_ID = 'scribe_v1';

/** Field names match `app/api/audio+api.ts` so the two routes take one body shape. */
interface TranscribeBody {
  cairnId?: unknown;
  stoneId?: unknown;
  latitude?: unknown;
  longitude?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  // Read both secrets before doing any work. A 501 naming the variable is the
  // difference between "I forgot to set the key" and twenty minutes spent
  // believing the microphone is broken — which the ticket calls out by name.
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return notImplemented('SUPABASE_SERVICE_ROLE_KEY');

  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenLabsKey) return notImplemented('ELEVENLABS_API_KEY');

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl) return notImplemented('EXPO_PUBLIC_SUPABASE_URL');
  if (!supabaseAnonKey) return notImplemented('EXPO_PUBLIC_SUPABASE_ANON_KEY');

  // The caller's own token. Not optional and not substitutable: the whole
  // proximity check below runs under this identity, and an anon-key client
  // with no Authorization header is a different (and unentitled) user.
  const accessToken = bearerToken(request.headers.get('authorization'));
  if (!accessToken) return fail(401, 'Missing bearer token.');

  let body: TranscribeBody;
  try {
    body = (await request.json()) as TranscribeBody;
  } catch {
    return fail(400, 'Body must be JSON.');
  }

  const cairnId = asString(body.cairnId);
  const stoneId = asString(body.stoneId);
  // The position is in the body because `cairn_detail` cannot work without one
  // — it raises 'position required' on a null lat/lng, deliberately, so that
  // nothing ever computes a NaN distance and lets it pass a comparison. The
  // ticket's two-field body predates that. Yes, a client can lie about where it
  // is standing; that is the same single-person exposure the gate already
  // accepts everywhere else, and it is much smaller than a route that grants
  // itself proximity by reading the cairn's own coordinates.
  const lat = asNumber(body.latitude);
  const lng = asNumber(body.longitude);
  if (!cairnId || !stoneId) {
    return fail(400, 'Body must be { cairnId, stoneId, latitude, longitude }.');
  }
  if (lat === null || lng === null) return fail(400, 'A caller position is required.');

  // --- The gate, as the caller ---------------------------------------------

  const asCaller = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: detail, error: detailError } = await asCaller.rpc('cairn_detail', {
    p_cairn_id: cairnId,
    p_lat: lat,
    p_lng: lng,
  });

  if (detailError) {
    // 'cairn not found' (P0002) covers "does not exist" and "not your Space"
    // alike, on purpose — a distinct 403 would confirm the cairn exists. Keep
    // that indistinguishable here too rather than helpfully splitting it.
    return fail(403, 'Not visible to you.');
  }

  const gated = detail as GatedDetail | null;
  if (!gated || gated.band !== 'unlocked') {
    return fail(403, 'Not unlocked from where you are standing.');
  }

  const stone = (gated.stones ?? []).find((candidate) => candidate.id === stoneId);
  if (!stone) return fail(404, 'No such stone on this cairn.');

  const audioPath = typeof stone.audio_path === 'string' ? stone.audio_path : null;
  if (!audioPath) return fail(400, 'That stone has no audio.');

  // Second, independent check on the one operation that can reach another
  // cairn's media, exactly as 0004_proximity_gate.sql asks the signer to do.
  // The RPC derives this path itself, so this can only fire if the RPC is
  // wrong — which is when you want it to fire.
  if (!audioPath.startsWith(`${cairnId}/`)) {
    return fail(400, 'Refusing an audio path outside this cairn.');
  }

  // --- Fetch, transcribe, write --------------------------------------------

  const asService: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: audio, error: downloadError } = await asService.storage
    .from(AUDIO_BUCKET)
    .download(audioPath);

  if (downloadError || !audio) {
    return fail(502, `Could not read ${audioPath} from ${AUDIO_BUCKET}.`);
  }

  let transcript: string;
  try {
    transcript = await scribe(audio, audioPath, elevenLabsKey);
  } catch (error) {
    // Swallowed at the boundary rather than thrown: an unhandled rejection on
    // the server is a stack trace nobody reads, and the client is required to
    // ignore this response anyway.
    return fail(502, `ElevenLabs Scribe failed: ${messageOf(error)}`);
  }

  // Service role because `stones` has no update policy for clients — the old
  // `stones update own` policy was dropped as a confused-deputy hole, and this
  // route is not reinstating it: it takes ids, fetches, and writes text it
  // produced itself. It never accepts a caller-supplied transcript, which is
  // the difference between this and a write-anything endpoint.
  const { error: writeError } = await asService
    .from('stones')
    .update({ transcript })
    .eq('id', stoneId)
    .eq('cairn_id', cairnId);

  if (writeError) return fail(502, `Could not write transcript: ${writeError.message}`);

  return Response.json({ transcript });
}

/**
 * One multipart POST to Scribe. `file` and `model_id` are the only fields sent
 * — no diarization, no language hint. Leaving the language unset lets Scribe
 * detect Slovenian rather than being told English by a default.
 */
async function scribe(audio: Blob, path: string, apiKey: string): Promise<string> {
  const form = new FormData();
  // The filename matters: Scribe sniffs the container from the extension as
  // well as the content type, and an extensionless part gets rejected as an
  // unsupported format even though the bytes are a perfectly good m4a.
  form.append('file', audio, path.split('/').pop() ?? 'stone.m4a');
  form.append('model_id', SCRIBE_MODEL_ID);

  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    // No Content-Type header. fetch writes the multipart boundary itself, and
    // setting it by hand produces a body the server cannot split.
    headers: { 'xi-api-key': apiKey },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`);
  }

  const payload = (await response.json()) as { text?: unknown };
  if (typeof payload.text !== 'string' || !payload.text.trim()) {
    throw new Error('Response carried no text.');
  }
  return payload.text.trim();
}

// --- Shapes and small helpers ----------------------------------------------

/** Only the parts of the `cairn_detail` jsonb this route reads. */
interface GatedDetail {
  band?: string;
  stones?: { id?: string; audio_path?: unknown }[];
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 501, not 500: the route is correct and the deployment is incomplete. Naming
 * the variable is the entire value of this response — a bare 500 sends someone
 * to the audio pipeline instead of to their .env.
 */
function notImplemented(variable: string): Response {
  return Response.json(
    { error: `Transcription is not configured: ${variable} is not set on the server.` },
    { status: 501 },
  );
}

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status });
}
