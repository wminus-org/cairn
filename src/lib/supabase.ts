/**
 * Supabase client.
 *
 * CRN-004 owns auth and the RPC wrappers. This module is the minimum that
 * makes them possible: a single client, configured the way React Native needs.
 *
 * Three non-obvious requirements, all of which cost an hour if missed:
 *  - `react-native-url-polyfill/auto` must be imported before supabase-js, or
 *    every request throws on a missing URL implementation.
 *  - AsyncStorage must be passed as the auth storage, or the session is lost
 *    on every reload.
 *  - `detectSessionInUrl: false`, because there is no URL to detect it in and
 *    the default tries to read one.
 */
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
