/**
 * POST /api/brief — CRN-023. "Brief me": the spoken synthesis of a cairn.
 *
 * Body `{ cairnId, latitude, longitude }` → `{ summary, cached, generatedAt }`.
 *
 * WHY THIS IS A SERVER ROUTE AND NOT A CLIENT CALL. Two reasons, and only the
 * second one is about keys.
 *
 *  1. THE GATE. A briefing is a synthesis of every transcript in a cairn — it is
 *     the most concentrated form of exactly the content the proximity gate
 *     exists to protect, and CRN-023 is explicit that a judge opening the
 *     network inspector on this call is the single most likely place this
 *     product gets caught. So the route runs `cairn_detail` AS THE CALLER,
 *     under their own JWT and their own claimed position, and refuses anything
 *     that does not come back `unlocked`. The distance is re-derived by the
 *     server from the cairn's stored row; nothing in the request body can
 *     assert proximity, and there is no client flag to trust. This is the same
 *     shape as `app/api/audio+api.ts`, deliberately — one gate, one pattern.
 *
 *  2. THE KEY. `OPENROUTER_API_KEY` is read from the server's process
 *     environment and has no `EXPO_PUBLIC_` prefix. That prefix is not
 *     cosmetic: Metro inlines those values into the JS bundle, so an
 *     `EXPO_PUBLIC_OPENROUTER_API_KEY` would ship a billable key to every
 *     device that opens the app. This module runs only on the dev server.
 *
 * THE CACHE IS THE STAGE PATH, NOT AN OPTIMISATION. `briefings` is keyed by
 * `cairn_id` (see 0001_schema.sql — PK, no surrogate id) precisely so this is a
 * point lookup and an upsert. If a row exists and no stone is newer than
 * `generated_at`, this route returns it without touching a model. A cold model
 * call in front of judges is three to six seconds of a silent phone; the second
 * press has to be instant, and the demo is run by pre-warming the row by hand.
 *
 * LENGTH IS THE HIGHEST-RISK FAILURE IN THE TICKET. Spoken English runs ~150
 * words per minute, so the 25 seconds the pitch is built around is 60–70 words.
 * That is constrained in the prompt AND clamped here, because a prompt is a
 * request and a clamp is a guarantee. An unbounded summary read aloud is ninety
 * seconds of a phone droning while the room's attention leaves.
 *
 * MODELS. OpenRouter, free tier, named in the environment so the model can be
 * swapped without a code change — free endpoints get rate-limited and go
 * briefly unavailable, which is a Tuesday, not an outage. On failure the route
 * tries a second free model before giving up. On-device / Apple Foundation
 * Models was researched and rejected for this ticket (see
 * tracker/reference/on-device-ai.md): no hard word-count control, and
 * cross-attributing many stones across several authors is its weak edge.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Default model. Overridable via `OPENROUTER_MODEL` so a rate-limited or
 * withdrawn free endpoint is an .env edit, not a deploy.
 */
const DEFAULT_MODEL = 'google/gemma-4-31b-it:free';

/** Tried only if the primary model errors or returns nothing usable. */
const FALLBACK_MODEL = 'qwen/qwen3-next-80b-a3b-instruct:free';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** ~25 seconds of speech at ~150 wpm. Stated in the prompt, checked below. */
const TARGET_WORDS = 70;

/**
 * The retry threshold. Not `TARGET_WORDS`: models overshoot 70 by a sentence
 * routinely and that costs two seconds, while burning a second round trip on
 * every generation costs the stage press. Past this, the output is a different
 * kind of wrong and is worth one stricter re-ask.
 */
const MAX_WORDS = 140;

/**
 * Hard ceiling applied after the re-ask. Sits above `TARGET_WORDS` so a good
 * answer is never cut, and below `MAX_WORDS` so a bad one is. Truncation is at
 * a sentence boundary — a briefing that stops mid-word sounds like a crash.
 */
const TRUNCATE_WORDS = 90;

interface BriefBody {
  cairnId?: unknown;
  latitude?: unknown;
  longitude?: unknown;
}

/** Only the parts of the `cairn_detail` jsonb this route reads. */
interface GatedDetail {
  title?: unknown;
  band?: string;
  stones?: {
    id?: string;
    kind?: unknown;
    author_name?: unknown;
    created_at?: unknown;
    body_text?: unknown;
    transcript?: unknown;
  }[];
}

/** One stone, reduced to the only three things the prompt is allowed to see. */
interface BriefLine {
  author: string;
  createdAt: string;
  kind: string;
  text: string;
}

export async function POST(request: Request): Promise<Response> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;

  // Every missing variable is named. The failure this replaces is a 500 that
  // reads like a network problem and sends someone to the wrong half of the
  // stack for twenty minutes; a line is missing from .env.
  if (!supabaseUrl) return notImplemented('EXPO_PUBLIC_SUPABASE_URL');
  if (!anonKey) return notImplemented('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (!serviceRoleKey) return notImplemented('SUPABASE_SERVICE_ROLE_KEY');
  if (!openRouterKey) return notImplemented('OPENROUTER_API_KEY');

  const accessToken = bearerToken(request.headers.get('authorization'));
  if (!accessToken) return fail(401, 'Missing Authorization: Bearer <supabase access token>.');

  let body: BriefBody;
  try {
    body = (await request.json()) as BriefBody;
  } catch {
    return fail(400, 'Body must be JSON.');
  }

  const cairnId = asString(body.cairnId);
  const lat = asNumber(body.latitude);
  const lng = asNumber(body.longitude);
  if (!cairnId) return fail(400, 'Body must be { cairnId, latitude, longitude }.');
  // Never defaulted. A missing coordinate must not become 0,0 — that is a real
  // place in the Atlantic, and relying on it being inside nothing is how a gate
  // quietly stops gating.
  if (lat === null || lng === null) return fail(400, 'A caller position is required.');

  // --- 1. The gate, as the caller -------------------------------------------
  //
  // `persistSession: false` because this client is built per request and thrown
  // away; a persisting server-side client would share one caller's session
  // across every request the dev server handles.
  const asCaller = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: detail, error: detailError } = await asCaller.rpc('cairn_detail', {
    p_cairn_id: cairnId,
    p_lat: lat,
    p_lng: lng,
  });

  // P0002 'cairn not found' covers "does not exist" and "not your Space" alike,
  // deliberately indistinguishable — a separate status here would confirm the
  // cairn exists. Everything else the gate raises is also a refusal from this
  // route's point of view, so they all land on the same denial.
  if (detailError) return denied();

  const gated = (detail as GatedDetail | null) ?? null;
  if (!gated || gated.band !== 'unlocked') return denied();

  const lines = briefLines(gated);
  if (lines.length === 0) {
    return fail(422, 'Nothing here has been written down yet.');
  }

  // --- 2. The cache ----------------------------------------------------------
  //
  // service_role because `briefings` has no client policy at all, read or write
  // (0004_proximity_gate.sql: "no client policy at all… generated and stored
  // server-side"). Reached only past the gate, and only ever addressing the
  // cairn id the gate just released.
  const asService: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const newestStoneAt = lines.reduce(
    (newest, line) => Math.max(newest, Date.parse(line.createdAt) || 0),
    0,
  );

  const { data: cachedRow } = await asService
    .from('briefings')
    .select('summary_text, generated_at')
    .eq('cairn_id', cairnId)
    .maybeSingle();

  const cachedSummary = asString((cachedRow as { summary_text?: unknown } | null)?.summary_text);
  const cachedAt = asString((cachedRow as { generated_at?: unknown } | null)?.generated_at);

  // Invalidated by a stone newer than the row, which is the twelfth-stone case
  // in the acceptance criteria. Everything else is a hit.
  if (cachedSummary && cachedAt && (Date.parse(cachedAt) || 0) >= newestStoneAt) {
    return Response.json({ summary: cachedSummary, cached: true, generatedAt: cachedAt });
  }

  // --- 3. Generate -----------------------------------------------------------

  // Deduped so that pointing OPENROUTER_MODEL at the fallback does not spend
  // two round trips discovering the same endpoint is down.
  const models = [
    ...new Set([process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL, FALLBACK_MODEL]),
  ];

  let summary: string;
  try {
    summary = await generate(lines, models, openRouterKey);
  } catch (error) {
    // A stale briefing is worth more on stage than an error toast: the room
    // hears something true about this cairn, just missing the newest stone.
    if (cachedSummary && cachedAt) {
      return Response.json({ summary: cachedSummary, cached: true, generatedAt: cachedAt });
    }
    return fail(502, `Could not generate a briefing: ${messageOf(error)}`);
  }

  // --- 4. Store --------------------------------------------------------------
  //
  // `cairn_id` is the primary key, so this is an upsert by construction — one
  // live briefing per cairn, no "latest by generated_at" query and no ordering
  // bug on stage. `audio_url` is left null on purpose: playback is device TTS
  // (expo-speech), which is instant, free, offline, and cannot be broken by
  // venue wifi. Cloud TTS is explicitly out of CRN-023.
  //
  // The write is not awaited for its result beyond logging: a failed upsert is
  // not a failed briefing. The text is in hand and the phone should speak it;
  // the only cost is that the next press regenerates instead of hitting cache.
  const generatedAt = new Date().toISOString();
  await asService
    .from('briefings')
    .upsert({ cairn_id: cairnId, summary_text: summary, generated_at: generatedAt });

  return Response.json({ summary, cached: false, generatedAt });
}

/**
 * Stones the briefing may be built from, oldest first.
 *
 * `transcript` is the source, falling back to `body_text` for text stones — a
 * text stone's body IS its transcript, and CRN-023 asks for both. A stone with
 * neither is skipped rather than passed through as an empty line: a model given
 * a blank line will invent something to fill it, which is precisely the
 * hallucination the prompt spends its budget forbidding.
 *
 * This reads STORED text only. It never transcribes anything and must never be
 * made to await CRN-022 — the seed data writes transcripts directly, so Brief
 * me works with live transcription switched off entirely.
 */
function briefLines(detail: GatedDetail): BriefLine[] {
  const rows: BriefLine[] = [];

  for (const stone of detail.stones ?? []) {
    const text = asString(stone.transcript) ?? asString(stone.body_text);
    const createdAt = asString(stone.created_at);
    if (!text || !createdAt) continue;

    rows.push({
      author: asString(stone.author_name) ?? 'Walker',
      createdAt,
      kind: asString(stone.kind) ?? 'stone',
      text,
    });
  }

  // The RPC already orders `created_at asc`; sorting anyway is cheap for eleven
  // rows, and a briefing that silently narrates a cairn backwards because an
  // ordering changed upstream is the kind of thing nobody notices until the
  // three-month spread is on a projector.
  rows.sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
  return rows;
}

/**
 * One briefing, with the length actually enforced.
 *
 * Three lines of defence, in order of preference: the prompt asks, a stricter
 * re-ask corrects, and the truncator guarantees. Only the last one is a
 * guarantee — a prompt is a request, and the ticket is blunt that an unbounded
 * summary read aloud on stage is the highest-risk failure in the ticket.
 */
async function generate(lines: BriefLine[], models: string[], apiKey: string): Promise<string> {
  const transcript = lines.map(promptLine).join('\n');

  let lastError: unknown = null;

  for (const model of models) {
    try {
      let summary = await complete(model, SYSTEM_PROMPT, userPrompt(transcript), apiKey);

      if (wordCount(summary) > MAX_WORDS) {
        // One re-ask, not a loop. A model that ignores the limit twice will
        // ignore it five times, and every attempt is another second of silence.
        try {
          summary = await complete(model, STRICT_SYSTEM_PROMPT, userPrompt(transcript), apiKey);
        } catch {
          // Keep the long first answer — the truncator below can still make it
          // speakable, which is better than failing over to another model.
        }
      }

      return truncateToSentence(summary);
    } catch (error) {
      // Free endpoints rate-limit and go briefly unavailable. That is what the
      // second model in the list is for.
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No model returned a briefing.');
}

/**
 * One line per stone, strict chronological order, as CRN-023 specifies:
 * `2026-04-02 — Marta Kovač (voice): the valve on the third riser is weeping`.
 *
 * The date is given as an ISO day and the model is told to say it the way a
 * person would. Handing it a pre-formatted "back in April" would be this route
 * deciding the phrasing, and handing it a full timestamp invites it to read
 * seconds aloud.
 */
function promptLine(line: BriefLine): string {
  const day = line.createdAt.slice(0, 10);
  return `${day} — ${line.author} (${line.kind}): ${collapse(line.text)}`;
}

/**
 * Role and constraints in the system message, data in the user message.
 *
 * Every clause here is load-bearing: no markdown (it gets read aloud as
 * asterisks), no preamble (25 seconds cannot afford "This cairn contains…"),
 * spoken date phrasing (a TTS voice reading "2026-04-02" is the moment the
 * illusion dies), and invent nothing (this is institutional memory, and a
 * confidently wrong attribution in front of the room is worse than silence).
 */
const SYSTEM_PROMPT = [
  'You brief someone who has just walked up to a place and needs to know what happened here.',
  'They are standing outside, holding a phone, and your words are read aloud to them.',
  '',
  'Say exactly three things, in this order:',
  '1. What happened here, across the whole span of time.',
  '2. What is still unresolved.',
  '3. What the last person said.',
  '',
  'Rules:',
  '- MAXIMUM 70 WORDS. Three sentences at most. This is spoken aloud and must last about 25 seconds.',
  '- Plain spoken prose. No markdown, no bullet points, no headings, no asterisks.',
  '- No preamble and no meta-commentary. Do not say "This cairn contains" or "Here is a summary".',
  '- Attribute by name and by date, and get both right. Say dates the way a person speaks them ("Marta, back in April"), never as ISO strings.',
  '- Invent nothing. Every name, date, fact and open question must come from the notes given to you. If something is not in them, it did not happen.',
].join('\n');

/** Used only for the one re-ask, after the first answer blew past the limit. */
const STRICT_SYSTEM_PROMPT = [
  SYSTEM_PROMPT,
  '',
  'Your previous answer was far too long. Write THREE SENTENCES AND NOTHING MORE.',
  'Stay under 60 words. Count them. Cut detail before you exceed the limit.',
].join('\n');

function userPrompt(transcript: string): string {
  return [
    'Notes left at this place, oldest first:',
    '',
    transcript,
    '',
    'Brief me.',
  ].join('\n');
}

/**
 * One OpenRouter chat completion.
 *
 * `max_tokens` is a backstop on cost and latency, not the length control — the
 * length control is the prompt plus the truncator, because a token cap cuts
 * mid-word and the result gets spoken. Temperature and friends are deliberately
 * omitted: several free endpoints reject unfamiliar sampling parameters with a
 * 400, and a 60-word summary from stored notes wants the default anyway.
 */
async function complete(
  model: string,
  system: string,
  user: string,
  apiKey: string,
): Promise<string> {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`${model}: ${response.status} ${(await response.text()).slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
    error?: { message?: unknown };
  };

  // OpenRouter can answer 200 with an error body when an upstream provider
  // fails, so a bare `choices[0]` read would throw a TypeError instead of
  // failing over to the next model.
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    const upstream = typeof payload.error?.message === 'string' ? payload.error.message : 'no text';
    throw new Error(`${model}: ${upstream}`);
  }

  return clean(content);
}

/**
 * Strips what a TTS voice would otherwise read out loud: markdown emphasis,
 * bullets, headings, and the surrounding quotes some models wrap prose in.
 * Cosmetic on a page, audible in speech.
 */
function clean(text: string): string {
  let out = text.trim();
  out = out.replace(/^```[a-z]*\n?|```$/gi, '').trim();
  out = out.replace(/^#{1,6}\s+/gm, '');
  out = out.replace(/^\s*[-*•]\s+/gm, '');
  out = out.replace(/\*\*|\*|__|_/g, '');
  out = out.replace(/^["“](.*)["”]$/s, '$1');
  return collapse(out);
}

/** Newlines become spaces: paragraph breaks are silence a listener reads as a stall. */
function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * The guarantee. Keeps whole sentences until the budget runs out, and always
 * keeps at least the first one — a briefing that stops mid-word sounds like the
 * app crashed, and an empty one leaves the presenter with nothing to read.
 */
function truncateToSentence(text: string): string {
  if (wordCount(text) <= TRUNCATE_WORDS) return text;

  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [];
  if (sentences.length === 0) {
    // No punctuation to cut on. Take the words and close the sentence, rather
    // than handing TTS a fragment that trails off.
    return `${text.split(/\s+/).slice(0, TRUNCATE_WORDS).join(' ')}.`;
  }

  // The first sentence is taken unconditionally — `kept` is empty on the first
  // pass, so the budget check cannot fire — which is what makes an over-long
  // opening sentence still produce something speakable rather than nothing.
  let kept = '';
  for (const sentence of sentences) {
    const next = `${kept}${sentence}`;
    if (kept && wordCount(next) > TRUNCATE_WORDS) break;
    kept = next;
  }

  return collapse(kept) || collapse(text);
}

// --- Small helpers ----------------------------------------------------------

/**
 * One shape for every refusal: not unlocked, not a member, no such cairn. Same
 * status, same body. Telling them apart is precisely the leak the gate exists
 * to avoid, and a briefing is the densest thing behind it.
 */
function denied(): Response {
  return fail(403, 'Walk to the cairn to hear this.');
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
 * the variable is the entire value of this response.
 */
function notImplemented(variable: string): Response {
  return Response.json(
    { error: `Briefing is not configured: ${variable} is not set on the server.` },
    { status: 501 },
  );
}

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status });
}
