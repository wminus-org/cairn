/**
 * Screen 13 — NEW PROJECT (modal, deep background).
 *
 * CREATE PROJECT is deliberately a stub. 0004_proximity_gate.sql grants
 * `select` on `public.spaces` to authenticated and nothing else — there is no
 * insert privilege and no insert policy ("There is deliberately no `spaces`
 * insert policy… Creating a Space and generating the six-character code is
 * CRN-018's ticket"). A live insert here would 403 as a vague network error,
 * so the button renders disabled with a mono notice instead. When CRN-018's
 * migration lands, wire it with expo-crypto's randomUUID for the id and the
 * name/visibility state below — both are already captured.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';

import { colors, fonts, type } from '../src/theme';
import { Btn, MonoLabel, Screen, SerifTitle } from '../src/ui';

type ProjectVisibility = 'TEAM' | 'PUBLIC' | 'PRIVATE';

const VISIBILITIES: readonly ProjectVisibility[] = ['TEAM', 'PUBLIC', 'PRIVATE'];

export default function ProjectNewScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<ProjectVisibility>('TEAM');

  return (
    <Screen deep>
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.cancel}>
        <MonoLabel color={colors.textMuted}>✕ CANCEL</MonoLabel>
      </Pressable>

      <SerifTitle style={styles.heading}>New project</SerifTitle>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Rooftop solar install"
        placeholderTextColor={colors.t25}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        style={styles.nameInput}
      />

      <MonoLabel color={colors.t45} style={styles.sectionLabel}>
        VISIBILITY
      </MonoLabel>
      <View style={styles.segments}>
        {VISIBILITIES.map((option) => {
          const selected = option === visibility;
          return (
            <Pressable
              key={option}
              onPress={() => setVisibility(option)}
              style={[styles.segment, selected ? styles.segmentSelected : styles.segmentIdle]}
            >
              <Text
                style={[
                  type.mono,
                  styles.segmentLabel,
                  selected
                    ? { color: colors.backgroundDeep, fontFamily: fonts.monoBold }
                    : { color: colors.t60 },
                ]}
              >
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <MonoLabel color={colors.t45} style={styles.sectionLabel}>
        AREA
      </MonoLabel>
      <View style={styles.areaBox}>
        <Svg
          width="100%"
          height="100%"
          viewBox="0 0 340 150"
          preserveAspectRatio="none"
          style={StyleSheet.absoluteFill}
        >
          <G stroke={colors.contour} strokeOpacity={0.15} fill="none">
            <Path d="M 60,-10 L 52,160" />
            <Path d="M 170,-10 L 178,160" />
            <Path d="M 280,-10 L 272,160" />
            <Path d="M -10,50 L 350,44" />
            <Path d="M -10,110 L 350,116" />
          </G>
          <Rect
            x={90}
            y={35}
            width={150}
            height={80}
            fill={colors.accent12}
            stroke={colors.accent}
            strokeWidth={1.2}
            strokeDasharray={[5, 4]}
          />
        </Svg>
        <MonoLabel size="xs" color={colors.t45} style={styles.areaHint}>
          DRAW BOUNDARY · OPTIONAL
        </MonoLabel>
      </View>

      <View style={styles.spacer} />

      {/* Disabled until the spaces INSERT policy ships — see the header comment. */}
      <Btn label="CREATE PROJECT" variant="accent" disabled style={styles.createBtn} />
      <MonoLabel size="xs" color={colors.t40} style={styles.createNotice}>
        PROJECT CREATION LANDS WITH THE NEXT MIGRATION
      </MonoLabel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cancel: { alignSelf: 'flex-start', marginTop: 16 },
  heading: { marginTop: 36 },
  nameInput: {
    marginTop: 16,
    paddingTop: 20,
    paddingBottom: 12,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.t35,
    fontSize: 19,
    color: colors.text,
  },
  sectionLabel: { marginTop: 32 },
  segments: { flexDirection: 'row', gap: 2, marginTop: 12 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 13 },
  segmentSelected: { backgroundColor: colors.contour },
  segmentIdle: { borderWidth: 1, borderColor: colors.t25 },
  segmentLabel: { letterSpacing: 1.3 },
  areaBox: {
    marginTop: 12,
    height: 150,
    borderWidth: 1,
    borderColor: colors.t18,
    overflow: 'hidden',
  },
  areaHint: { position: 'absolute', left: 12, bottom: 10 },
  spacer: { flex: 1 },
  createBtn: { opacity: 0.5 },
  createNotice: { textAlign: 'center', marginTop: 10, marginBottom: 4 },
});
