import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { initMapbox } from '../src/lib/mapbox';
import { colors } from '../src/theme';

export default function RootLayout() {
  // Once, before any MapView can mount. CRN-006 builds on this.
  useEffect(() => {
    initMapbox();
  }, []);

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
