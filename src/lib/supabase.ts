/**
 * Supabase client, session bootstrap, and the shared storage upload helper.
 *
 * Three non-obvious client requirements, all of which cost an hour if missed:
 *  - `react-native-url-polyfill/auto` must be imported before supabase-js, or
 *    every request throws on a missing URL implementation.
 *  - AsyncStorage must be passed as the auth storage, or the session is lost
 *    on every reload.
 *  - `detectSessionInUrl: false`, because there is no URL to detect it in and
 *    the default tries to read one.
 *
 * This module is the data layer for CRN-004 (auth) and CRN-003 (storage). It
 * deliberately contains no UI: the splash gate, the debug `user.id` readout and
 * the name field live in the screen that calls `ensureSession()`.
 */
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { decode as decodeBase64 } from 'base64-arraybuffer';
import { File } from 'expo-file-system';
import { AppState } from 'react-native';

import { env } from '../env';

let client: SupabaseClient | null = null;

/**
 * Lazily constructed so that a missing .env surfaces as a readable message on
 * first use rather than as a redbox during module evaluation at app boot.
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

// --- Auth (CRN-004) --------------------------------------------------------

let bootstrap: Promise<Session> | null = null;

/**
 * The one and only way the app acquires a session. `getSession()` first, and
 * `signInAnonymously()` only if that comes back null.
 *
 * Never call `signInAnonymously()` directly from a component. Every render loop
 * or hot-reload cycle that does mints a fresh anonymous user and orphans the
 * stones just recorded. Two things prevent that here:
 *  - the module-level promise below, so concurrent callers and remounts share
 *    one in-flight bootstrap rather than racing;
 *  - the `getSession()` check itself, which reads the persisted session out of
 *    AsyncStorage, so even a full module re-evaluation reuses the same user.
 *
 * A failed bootstrap clears the cache so the next caller retries — the venue
 * wifi will drop at least once today.
 */
export function ensureSession(): Promise<Session> {
  if (!bootstrap) {
    bootstrap = signInIfNeeded().catch((error: unknown) => {
      bootstrap = null;
      throw error;
    });
  }
  return bootstrap;
}

async function signInIfNeeded(): Promise<Session> {
  const auth = getSupabase().auth;

  const { data: existing, error: getError } = await auth.getSession();
  if (getError) throw getError;

  // A stored session is not proof the user still exists. `getSession()` only
  // reads AsyncStorage — it never asks the server. Wipe the database (which
  // happens repeatedly on a build day) and the phone keeps presenting a JWT
  // for a deleted user: `auth.uid()` still resolves, so RLS lets the insert
  // through, and it dies on `cairns_created_by_fkey` instead, because the
  // trigger-created `profiles` row went with the user.
  //
  // `getUser()` does hit the server, so it is the cheap way to tell a live
  // session from a ghost. One round trip, once per app run.
  if (existing.session) {
    const { error: userError } = await auth.getUser();
    if (!userError) return existing.session;
    await auth.signOut().catch(() => {
      // Already gone server-side; the local clear below is what matters.
    });
  }

  const { data: created, error: signInError } = await auth.signInAnonymously();
  if (signInError) {
    // A flat 422 here almost always means anonymous sign-ins are still
    // disabled in Dashboard → Authentication → Sign In / Providers.
    throw signInError;
  }
  if (!created.session) {
    throw new Error('signInAnonymously() returned no session.');
  }
  return created.session;
}

/** The current user id, or null before `ensureSession()` has resolved. */
export async function getUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * Token auto-refresh follows the foreground. Call once at the app root and
 * keep the returned unsubscribe for cleanup.
 *
 * Without this, a phone that sat locked through lunch wakes with an expired
 * token and every RPC returns 401 at 15:45.
 */
export function startAuthAutoRefresh(): () => void {
  const auth = getSupabase().auth;

  if (AppState.currentState === 'active') {
    auth.startAutoRefresh();
  }

  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      auth.startAutoRefresh();
    } else {
      auth.stopAutoRefresh();
    }
  });

  return () => {
    subscription.remove();
    auth.stopAutoRefresh();
  };
}

/**
 * Writes `profiles.display_name` for the signed-in user. Backs the one-field
 * name entry in CRN-004; the trigger's `'Walker'` default stands until someone
 * uses it.
 *
 * `profiles` is default-deny with no policies as of the CRN-002 paste, so an
 * update from the client currently matches zero rows and returns no error. The
 * `.select()` is what turns that silence into a readable failure: if this
 * throws "no row updated", the missing piece is a self-update policy on
 * `public.profiles`, not this call.
 */
export async function setDisplayName(displayName: string): Promise<string> {
  const name = displayName.trim();
  if (!name) throw new Error('Display name is empty.');

  const session = await ensureSession();

  const { data, error } = await getSupabase()
    .from('profiles')
    .update({ display_name: name })
    .eq('id', session.user.id)
    .select('display_name')
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error(
      'No profiles row updated — the client cannot update its own profile ' +
        'yet. Grant an update policy on public.profiles for auth.uid() = id.',
    );
  }
  return data.display_name as string;
}

// --- Storage (CRN-003) -----------------------------------------------------

export type CairnBucket = 'cairn-audio' | 'cairn-images';

/**
 * The key convention, in one place, so CRN-011 and CRN-012 cannot invent two.
 * Note `briefings` is keyed by `cairn_id` — there is no `briefing_id`.
 */
export const storageKeys = {
  stoneAudio: (cairnId: string, stoneId: string) => `${cairnId}/${stoneId}.m4a`,
  stoneImage: (cairnId: string, stoneId: string) => `${cairnId}/${stoneId}.jpg`,
  pinAudio: (cairnId: string, stoneId: string, pinId: string) =>
    `${cairnId}/${stoneId}/${pinId}.m4a`,
  briefingAudio: (cairnId: string) => `briefings/${cairnId}.m4a`,
};

/**
 * The single shared upload path. Takes a local file URI, a bucket and a key;
 * returns the storage path the object landed at.
 *
 * Read as base64 and decode to an ArrayBuffer — do NOT pass `{ uri, type, name }`
 * or a `File`-ish object to `.upload()` in React Native. That "succeeds" and
 * writes a 0-byte object, which passes every check except playback. The size
 * guards below fail loudly instead, on the upload rather than on stage.
 *
 * `contentType` is required and explicit: without it objects land as
 * `application/octet-stream` and iOS playback refuses them, which reads as
 * "my recording is broken" when the recording is fine. Use `audio/mp4` for the
 * expo-audio `.m4a` output and `image/jpeg` for photos.
 *
 * `upsert: true` so a retry overwrites a half-written object rather than
 * colliding with it — the keys are derived from ids, so the same key always
 * means the same stone.
 */
export async function uploadToBucket(
  localUri: string,
  bucket: CairnBucket,
  key: string,
  contentType: string,
): Promise<string> {
  const file = new File(normalizeFileUri(localUri));
  if (!file.exists) {
    throw new Error(`Nothing to upload at ${localUri} — the file does not exist.`);
  }
  if (file.size === 0) {
    throw new Error(`Nothing to upload at ${localUri} — the file is 0 bytes.`);
  }

  const body = decodeBase64(await file.base64());
  if (body.byteLength === 0) {
    throw new Error(`Read 0 bytes from ${localUri}; refusing to upload an empty object.`);
  }

  // upsert: false, deliberately. `upsert: true` sends `x-upsert: true`, and
  // storage-api's upsert path fails the RLS check even when the plain insert
  // passes — verified against the live project: same key, same session, insert
  // 200 / upsert 403 "new row violates row-level security policy". That was the
  // bug where every voice note died and text notes worked, because text never
  // uploads.
  //
  // Losing upsert costs nothing here. The key is {cairn_id}/{stone_id}, the
  // stone id is minted before the upload and reused on retry, so a collision
  // means this exact file already landed. Treat it as success rather than
  // failing a drop that in fact succeeded.
  const { data, error } = await getSupabase()
    .storage.from(bucket)
    .upload(key, body, { contentType, upsert: false });

  if (error) {
    const message = String((error as { message?: string }).message ?? error);
    if (/already exists|Duplicate|resource already/i.test(message)) return key;
    // `Network request failed` here is usually a misspelled bucket or a
    // missing session, not the network.
    throw error;
  }
  return data.path;
}

/** expo-audio and expo-camera return `file://` URIs; a bare path is a mistake worth absorbing. */
function normalizeFileUri(uri: string): string {
  return uri.startsWith('/') ? `file://${uri}` : uri;
}
