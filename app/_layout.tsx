import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { startAuthAutoRefresh } from '../src/lib/supabase';
import { colors } from '../src/theme';

export default function RootLayout() {
  // Pump the token refresh off AppState, once, at the root. `autoRefreshToken`
  // alone only covers the foreground: supabase-js cannot refresh through a
  // backgrounded RN app, so a phone that sleeps between rehearsal and stage
  // wakes with a dead JWT and every RPC returns 401. Returns its own
  // unsubscribe, so returning it directly is the cleanup.
  //
  // Mapbox is not initialised here: `initMapbox()` runs at module scope in the
  // screens that need it, which is strictly earlier than a root effect — parent
  // effects fire after children have already mounted.
  useEffect(() => startAuthAutoRefresh(), []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </>
  );
}
