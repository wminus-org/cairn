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

/**
 * Deterministic stone counts per column for a given stone id. Pure — same id
 * in, same array out, on any device, forever.
 */
export function stoneStackBuckets(stoneId: string): number[] {
  let state = hashSeed(stoneId);
  const buckets: number[] = [];
  for (let i = 0; i < WAVEFORM_BUCKETS; i += 1) {
    // xorshift32.
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    buckets.push(MIN_STONES + (state % (MAX_STONES - MIN_STONES + 1)));
  }
  return buckets;
}
