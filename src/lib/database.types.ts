/**
 * Row shapes for the seven tables in tracker/reference/data-model.md.
 *
 * Hand-written rather than generated, because the schema is one paste and is
 * not going to move today. If it does move, this file moves with it — it is
 * not authoritative. `tracker/reference/data-model.md` is.
 *
 * These types describe what the tables CONTAIN. They do not describe what a
 * client is allowed to READ. Every table is default-deny under RLS with no
 * select policies, so a direct `from('stones').select()` returns [] — that is
 * correct behaviour, not a bug. Reads go through security-definer RPCs, and
 * the gated fields below only ever arrive from the tier-2 RPC after the server
 * has computed distance_m <= radius_m for itself.
 */

export type StoneKind = 'voice' | 'photo' | 'text';
export type SpaceRole = 'owner' | 'member';

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
}

export interface Space {
  id: string;
  name: string;
  accent_hex: string;
  wordmark: string | null;
  join_code: string;
  created_by: string | null;
  created_at: string;
}

export interface SpaceMember {
  space_id: string;
  user_id: string;
  role: SpaceRole;
  created_at: string;
}

export interface Cairn {
  id: string;
  space_id: string | null;
  lat: number;
  lng: number;
  title: string | null;
  created_by: string | null;
  created_at: string;
  /** Per-cairn unlock radius. Read it; never hardcode 30 in a render path. */
  radius_m: number;
}

export interface Stone {
  id: string;
  cairn_id: string;
  author_id: string | null;
  kind: StoneKind;
  /** Gated. */
  body_text: string | null;
  /** Gated. Storage object path in `cairn-audio`, not a URL. */
  audio_url: string | null;
  /** Gated. Storage object path in `cairn-images`, not a URL. */
  image_url: string | null;
  image_aspect_ratio: number | null;
  /** Gated. */
  transcript: string | null;
  created_at: string;
}

export interface Pin {
  id: string;
  stone_id: string;
  /** Normalized 0–1, fraction across the image. NEVER pixels. */
  x: number;
  /** Normalized 0–1, fraction down the image. NEVER pixels. */
  y: number;
  /** Gated. */
  note_text: string | null;
  /** Gated. */
  audio_url: string | null;
  /** Gated. */
  transcript: string | null;
  /** Renders terracotta instead of amber. */
  unresolved: boolean;
  created_at: string;
}

export interface Briefing {
  /** Primary key. One live briefing per cairn — regeneration is an upsert. */
  cairn_id: string;
  generated_at: string;
  /** Gated. */
  summary_text: string | null;
  /** Gated. */
  audio_url: string | null;
}

/**
 * Tier 1 of the read contract: what any authenticated client may hold for a
 * cairn it can see, at any distance. Note what is absent — no audio_url, no
 * image_url, no transcript, no body_text. If a field ever needs adding here,
 * ask whether a judge with the network inspector open would be happy about it.
 */
export interface CairnMarker {
  id: string;
  lat: number;
  lng: number;
  title: string | null;
  space_id: string | null;
  accent_hex: string;
  stone_count: number;
  distance_m: number;
  radius_m: number;
}
