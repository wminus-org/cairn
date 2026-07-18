import {
  InstrumentSerif_400Regular_Italic,
  useFonts,
} from '@expo-google-fonts/instrument-serif';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
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
  useEffect(() => startAuthAutoRefresh(), []);

  // Fonts resolve async; nothing gates on them. Space Mono / Instrument Serif
  // fall back to the system faces for the first frames — src/theme.ts is
  // written so that fallback is silent, not broken.
  useFonts({
    SpaceMono_400Regular,
    SpaceMono_700Bold,
    InstrumentSerif_400Regular_Italic,
  });

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="record" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="save" options={{ presentation: 'card' }} />
        <Stack.Screen name="project-new" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}
