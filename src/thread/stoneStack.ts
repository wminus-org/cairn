/**
 * The 24-bucket amplitude array behind a voice stone's waveform.
 *
 * The server sends no amplitude data, in any band — there is no column for it
 * and `cairn_detail` has nothing to return. So the client synthesises the stack
 * from the stone `id`, which means the same stone draws the same stack on every
 * device and every render, including across the approach → unlocked boundary.
 * A waveform that reshuffles the moment the cairn unlocks tells the audience
 * the picture was never of anything.
 *
 * This is decoration standing in for data, and that is fine and deliberate: the
 * visual is load-bearing, the numbers behind it are not.
 */

/** Fixed by the design system. Twenty-four columns, no other value. */
export const WAVEFORM_BUCKETS = 24;

/** Stones per column, from the design system's 1–6 range. */
const MIN_STONES = 1;
const MAX_STONES = 6;

/** How many bars the redacted mass draws for a withheld text stone. */
export const REDACTED_LINES = 4;

/** FNV-1a. Cheap, stable, and identical under Hermes and Node. */
function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // The FNV prime by shift-and-add: `hash * 16777619` overflows the float53
    // that JS multiplication gives you and the low bits stop being stable.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  // A zero state would lock xorshift at zero forever.
  return hash === 0 ? 0x9e3779b9 : hash;
}

/** xorshift32, one step. Extracted so both synthesisers share the same stream. */
function step(state: number): number {
  let next = state;
  next ^= next << 13;
  next >>>= 0;
  next ^= next >>> 17;
  next ^= next << 5;
  next >>>= 0;
  return next;
}

/**
 * Deterministic stone counts per column for a given stone id. Pure — same id
 * in, same array out, on any device, forever.
 */
export function stoneStackBuckets(stoneId: string): number[] {
  let state = hashSeed(stoneId);
  const buckets: number[] = [];
  for (let i = 0; i < WAVEFORM_BUCKETS; i += 1) {
    state = step(state);
    buckets.push(MIN_STONES + (state % (MAX_STONES - MIN_STONES + 1)));
  }
  return buckets;
}

/**
 * Line widths, as fractions of the column, for the redacted mass that stands in
 * for a text stone the server has withheld.
 *
 * This is the same trade as the waveform and it needs saying out loud: these
 * bars are NOT the sentence with a filter over it — no sentence arrived. They
 * are a mass in the *shape* of prose, so that the approach band degrades form
 * rather than faking content. The ragged last line is the whole trick; four
 * equal bars read as a loading skeleton, four ragged ones read as writing you
 * are not allowed to have yet.
 *
 * Seeded off the stone id with a salt, so a stone's redaction and its waveform
 * do not visibly rhyme, and so the mass does not reshuffle between refetches.
 */
export function redactedLineWidths(stoneId: string, lines = REDACTED_LINES): number[] {
  let state = hashSeed(`${stoneId}:redact`);
  const widths: number[] = [];
  for (let i = 0; i < lines; i += 1) {
    state = step(state);
    // Full lines run 0.74–1.0 of the measure; the closing line breaks short,
    // 0.32–0.60, the way a real paragraph ends.
    widths.push(
      i === lines - 1 ? 0.32 + (state % 29) / 100 : 0.74 + (state % 27) / 100,
    );
  }
  return widths;
}
