import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Cairn — Expo app config.
 *
 * Everything secret comes from process.env and is read at *config evaluation*
 * time, i.e. during `expo start`. Nothing secret is written to a file that git
 * tracks: `.env` is gitignored.
 *
 * This app must run in the App Store build of Expo Go, so nothing here may
 * require a prebuild or a custom dev client: no config plugin that ships native
 * code, and no dependency that is not already bundled in Expo Go. The map is
 * Apple Maps via react-native-maps, which Expo Go bundles and which needs no
 * token of any kind.
 */

const IS_DEV = process.env.APP_VARIANT === 'development';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? 'Cairn (dev)' : 'Cairn',
  slug: 'cairn',
  scheme: 'cairn',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0F1E17',
  assetBundlePatterns: ['**/*'],
  // SDK 54 enables the New Architecture by default and Expo Go is built with
  // it, so this is a statement of the default rather than a request.
  newArchEnabled: true,

  ios: {
    bundleIdentifier: 'dev.nejc.cairn',
    supportsTablet: false,
    infoPlist: {
      // Belt and braces: the config plugins below set these too, but a missing
      // usage string is an instant silent crash the moment the API is touched,
      // so they are declared here as well.
      NSLocationWhenInUseUsageDescription:
        'Cairn shows you what has been left where you are standing.',
      NSMicrophoneUsageDescription:
        'Cairn records the voice notes you leave at a place, so whoever stands here next can hear them.',
      NSCameraUsageDescription:
        'Cairn takes photos of the thing you are standing in front of, so you can pin notes to the exact spot on it.',
      NSPhotoLibraryAddUsageDescription:
        'Cairn saves the photos you capture at a cairn to your library.',
    },
  },

  // Android is out of scope for the DEMO — see tracker/README.md — but declared
  // so a teammate on an Android phone can open it in Expo Go and look around.
  // Expo Go supplies its own permissions and its own Google Maps key, so these
  // strings only matter if someone later makes a standalone Android build.
  // Nothing here changes the iOS path.
  android: {
    package: 'dev.nejc.cairn',
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundColor: '#0F1E17',
    },
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'RECORD_AUDIO',
      'CAMERA',
    ],
  },

  // NOTE: this array is the single source of truth for plugins. `expo install`
  // wants to write a plugin entry into app.json, which it will silently create
  // alongside this file — and because this config spreads `...config` and then
  // replaces `plugins` wholesale, that entry would be dropped. If you add a
  // package that ships a config plugin, delete the app.json it leaves behind
  // and add the plugin here by hand.
  plugins: [
    'expo-router',
    'expo-asset',

    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Cairn shows you what has been left where you are standing.',
        // The whole product is foreground proximity. No background location,
        // no geofence notifications — deliberately out of scope.
        isIosBackgroundLocationEnabled: false,
      },
    ],

    [
      'expo-camera',
      {
        cameraPermission:
          'Cairn takes photos of the thing you are standing in front of, so you can pin notes to the exact spot on it.',
        microphonePermission:
          'Cairn records the voice notes you leave at a place, so whoever stands here next can hear them.',
      },
    ],

    [
      'expo-audio',
      {
        microphonePermission:
          'Cairn records the voice notes you leave at a place, so whoever stands here next can hear them.',
        enableBackgroundRecording: false,
      },
    ],
  ],

  extra: {
    // Non-secret runtime config. The pk.* token and the Supabase URL/anon key
    // are already inlined into the bundle via EXPO_PUBLIC_*; these mirrors exist
    // so a missing value can be reported at boot instead of at first map mount.
    mapboxAccessToken: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  },

  // Required for `app/api/*+api.ts` to exist at all. Expo Router only mounts API
  // routes when the router is building for a server output, and with this set
  // `expo start` serves them from the same Metro origin the phone already loads
  // the bundle from — which is why the audio signer needs no deployment today.
  // It changes nothing about the native app: there is no web target here.
  web: {
    output: 'server',
  },

  experiments: {
    typedRoutes: true,
  },
});
