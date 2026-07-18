import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Cairn — Expo app config.
 *
 * Everything secret comes from process.env and is read at *config evaluation*
 * time, i.e. during `expo prebuild` / `expo start`. Nothing secret is written
 * to a file that git tracks: `ios/` is gitignored, and `.env` is gitignored.
 *
 * Two Mapbox tokens, two different jobs — see README.md:
 *   EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN  pk.*  runtime, read by the JS bundle
 *   MAPBOX_DOWNLOAD_TOKEN            sk.*  build time, used by `pod install`
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
  newArchEnabled: true,
  assetBundlePatterns: ['**/*'],

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

  // Android is explicitly out of scope for this build — see tracker/README.md.
  // No android block, and `expo prebuild --platform ios` is the only prebuild
  // anyone should run.

  plugins: [
    'expo-router',
    'expo-dev-client',

    [
      '@rnmapbox/maps',
      {
        // Build-time credential (sk.*, scope DOWNLOADS:READ). CocoaPods uses it
        // to pull the Mapbox native SDK from Mapbox's private registry.
        // Undefined when unset, which the plugin treats as "not provided" —
        // prebuild still runs, but `pod install` will 401.
        //
        // NOTE: as of @rnmapbox/maps v10 this option is deprecated in favour of
        // the RNMAPBOX_MAPS_DOWNLOAD_TOKEN environment variable. Either works.
        // If you set both, expect a deprecation warning during prebuild.
        RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOAD_TOKEN,
      },
    ],

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

  experiments: {
    typedRoutes: true,
  },
});
