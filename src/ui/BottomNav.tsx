/**
 * The floating three-button nav from the wireframe: home circle, the big
 * orange mic, list circle. Rendered inside each top-level screen (map,
 * notes) rather than as a tab bar, so the map can run full-bleed under it.
 */
import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, s } from '../theme';
import { HomeIcon, ListIcon, MicIcon } from './icons';

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();

  const circle = (active: boolean) => [
    styles.circle,
    { borderColor: active ? colors.contour : colors.t35 },
  ];

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        style={circle(pathname === '/map')}
        onPress={() => router.navigate('/map')}
        hitSlop={8}
      >
        <HomeIcon />
      </Pressable>
      <Pressable style={styles.mic} onPress={() => router.push('/record')} hitSlop={8}>
        <View style={styles.micGlow} pointerEvents="none" />
        <MicIcon size={24} color={colors.background} />
      </Pressable>
      <Pressable
        style={circle(pathname === '/notes')}
        onPress={() => router.navigate('/notes')}
        hitSlop={8}
      >
        <ListIcon />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 34,
    paddingVertical: 8,
  },
  circle: {
    width: s.navCircle,
    height: s.navCircle,
    borderRadius: s.navCircle / 2,
    borderWidth: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mic: {
    width: s.mic,
    height: s.mic,
    borderRadius: s.mic / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micGlow: {
    position: 'absolute',
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    borderRadius: (s.mic + 16) / 2,
    backgroundColor: colors.accent18,
  },
});
