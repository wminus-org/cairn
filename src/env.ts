/**
 * Runtime environment.
 *
 * EXPO_PUBLIC_* variables are inlined into the JS bundle at build time by
 * Expo's Metro transformer, so they must be referenced as full static property
 * accesses (`process.env.EXPO_PUBLIC_FOO`) — a computed lookup does not get
 * substituted and reads as undefined on device.
 *
 * They are therefore NOT secret. The Supabase anon key and the pk.* Mapbox
 * token are both designed to be public, which is why they are the only ones
 * allowed here. MAPBOX_DOWNLOAD_TOKEN (sk.*) must never appear in this file or
 * anywhere else under src/ — it is a build-time CocoaPods credential with no
 * runtime use whatsoever.
 */

const raw = {
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN,
} as const;

export type EnvKey = keyof typeof raw;

/** Names of the variables that are missing or empty. Empty array = good. */
export function missingEnv(): EnvKey[] {
  return (Object.keys(raw) as EnvKey[]).filter((k) => !raw[k]);
}

function require_(key: EnvKey): string {
  const value = raw[key];
  if (!value) {
    throw new Error(
      `Missing ${key}. Copy .env.example to .env, fill it in, then restart ` +
        `Metro with a cleared cache: npx expo start --dev-client --clear`,
    );
  }
  return value;
}

/**
 * Accessors, not constants — they throw at first use rather than at import,
 * so a missing .env shows a readable screen instead of a boot redbox.
 */
export const env = {
  get supabaseUrl() {
    return require_('EXPO_PUBLIC_SUPABASE_URL');
  },
  get supabaseAnonKey() {
    return require_('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  },
  get mapboxAccessToken() {
    return require_('EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN');
  },
};
