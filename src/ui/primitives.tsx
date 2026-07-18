/**
 * Shared primitives, straight off the wireframe. Square corners, 1px borders,
 * mono uppercase labels. Screens compose these; they do not restyle them.
 */
import type { PropsWithChildren, ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, s, type } from '../theme';

// --- Screen -----------------------------------------------------------------

/** Full-bleed screen wrapper. `deep` uses the darker sheet background. */
export function Screen({
  children,
  deep = false,
  padded = true,
  style,
}: PropsWithChildren<{ deep?: boolean; padded?: boolean; style?: StyleProp<ViewStyle> }>) {
  return (
    <SafeAreaView
      style={[
        styles.screen,
        deep && { backgroundColor: colors.backgroundDeep },
        padded && { paddingHorizontal: s.gutter },
        style,
      ]}
      edges={['top', 'bottom']}
    >
      {children}
    </SafeAreaView>
  );
}

// --- Type -------------------------------------------------------------------

/** Space Mono, uppercase, letterspaced. The workhorse label. */
export function MonoLabel({
  children,
  color = colors.textMuted,
  size = 'md',
  style,
  numberOfLines,
}: PropsWithChildren<{
  color?: string;
  size?: 'md' | 'sm' | 'xs';
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}>) {
  const base = size === 'md' ? type.mono : size === 'sm' ? type.monoSmall : type.monoTiny;
  return (
    <Text style={[base, { color }, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

/** Instrument Serif italic display heading — "Name this note". */
export function SerifTitle({
  children,
  size = 40,
  style,
}: PropsWithChildren<{ size?: number; style?: StyleProp<TextStyle> }>) {
  return (
    <Text
      style={[
        type.displaySerif,
        { fontSize: size, lineHeight: Math.round(size * 1.15), color: colors.text },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

// --- Buttons ----------------------------------------------------------------

type BtnVariant = 'accent' | 'ink' | 'outline';

/**
 * The full-width square button. `accent` = orange fill (SAVE NOTE), `ink` =
 * bone fill (CONTINUE WITH APPLE), `outline` = 1px border.
 */
export function Btn({
  label,
  onPress,
  variant = 'outline',
  disabled = false,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: BtnVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fill =
    variant === 'accent' ? colors.accent : variant === 'ink' ? colors.contour : 'transparent';
  const ink = variant === 'outline' ? colors.text : colors.background;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: fill },
        variant === 'outline' && { borderWidth: 1, borderColor: colors.border },
        (pressed || disabled) && { opacity: 0.7 },
        style,
      ]}
    >
      <Text style={[type.mono, styles.btnLabel, { color: ink }]}>{label}</Text>
    </Pressable>
  );
}

// --- Toggle -----------------------------------------------------------------

/** The square 40×22 toggle. Orange bordered when on, knob slides right. */
export function SquareToggle({ value, onChange }: { value: boolean; onChange?: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange?.(!value)}
      hitSlop={10}
      style={[styles.toggle, { borderColor: value ? colors.accent : colors.t35 }]}
    >
      <View
        style={[
          styles.toggleKnob,
          value
            ? { right: 2, backgroundColor: colors.accent }
            : { left: 2, backgroundColor: colors.t45 },
        ]}
      />
    </Pressable>
  );
}

// --- Chip -------------------------------------------------------------------

/** Category chip. Selected = solid orange with dark bold mono. */
export function Chip({
  label,
  selected = false,
  accent = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  /** Orange-bordered but not filled — the HANDOVER badge on a row. */
  accent?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: colors.accent }
          : { borderWidth: 1, borderColor: accent ? colors.accent50 : colors.t25 },
      ]}
    >
      <Text
        style={[
          type.monoSmall,
          selected
            ? { color: colors.background, fontFamily: fonts.monoBold }
            : { color: accent ? colors.accent : colors.t70 },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// --- Rows & structure -------------------------------------------------------

/** Orange mono section header with a hairline under it — "RECORDING". */
export function SectionHeader({ label, muted = false }: { label: string; muted?: boolean }) {
  return (
    <View style={styles.sectionHeader}>
      <MonoLabel size="sm" color={muted ? colors.textFaint : colors.accent}>
        {label}
      </MonoLabel>
    </View>
  );
}

/** A settings-style row: title + optional mono subtitle, right-side control. */
export function Row({
  title,
  subtitle,
  right,
  onPress,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.row}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.heading, { fontWeight: '400', fontSize: 14, color: colors.text }]}>
          {title}
        </Text>
        {subtitle ? (
          <MonoLabel size="xs" color={colors.t40} style={{ marginTop: 4 }}>
            {subtitle}
          </MonoLabel>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

/** Hairline divider. */
export function Hairline({ faint = false }: { faint?: boolean }) {
  return <View style={{ height: 1, backgroundColor: faint ? colors.hairlineFaint : colors.hairline }} />;
}

// --- Avatar -----------------------------------------------------------------

/** Initial-in-a-circle. The app has no image avatars, ever. */
export function Avatar({ initial, size = 34 }: { initial: string; size?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[type.mono, { color: colors.text, fontSize: size * 0.35, lineHeight: size * 0.5 }]}>
        {initial.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  btn: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  btnLabel: { fontFamily: fonts.monoBold, fontSize: 12 },
  toggle: { width: 40, height: 22, borderWidth: 1 },
  toggleKnob: { position: 'absolute', top: 2, width: 16, height: 16 },
  chip: { paddingVertical: 9, paddingHorizontal: 14, alignSelf: 'flex-start' },
  sectionHeader: {
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    marginTop: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(234, 230, 218, 0.08)',
  },
  avatar: {
    backgroundColor: colors.surfaceSolid,
    borderWidth: 1,
    borderColor: colors.t35,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
