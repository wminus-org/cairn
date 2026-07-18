/**
 * Photo pin viewer with torch reveal (CRN-014). Read-only: full-bleed image
 * dimmed to 60%, numbered pins from NORMALISED coordinates, and tapping a pin
 * lifts a card while a bright copy of the image is clipped to a circle over
 * that pin — the fifteen seconds that sells the B2B half of the demo.
 *
 * Presented as a Modal from the thread so it holds the already-unlocked stone
 * and its pins directly; nothing here re-fetches or re-derives the gate.
 */
import { Image } from 'expo-image';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  LayoutRectangle,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { StonePin, UnlockedStone } from '../../lib/cairnApi';
import { getSupabase } from '../../lib/supabase';
import { colors, fonts, motion, s, type } from '../../theme';
import { MonoLabel } from '../../ui';
import { formatStamp } from './stamp';
import { enablePlaybackAudio } from './playbackAudio';

const PIN = 24;
const TORCH_R = 96;

async function signAudio(path: string): Promise<string | null> {
  try {
    const { data } = await getSupabase().storage.from('cairn-audio').createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export function PhotoPinView({
  visible,
  onClose,
  stone,
  imageUrl,
  authorName,
}: {
  visible: boolean;
  onClose: () => void;
  stone: UnlockedStone;
  imageUrl: string;
  authorName: string;
}) {
  const [frame, setFrame] = useState<LayoutRectangle | null>(null);
  const [selected, setSelected] = useState<StonePin | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const cardY = useRef(new Animated.Value(1)).current; // 1 = hidden (down)

  const player = useAudioPlayer(audioUrl ?? null);
  useAudioPlayerStatus(player); // subscribe so the player stays live

  const aspect = stone.image_aspect_ratio && stone.image_aspect_ratio > 0
    ? stone.image_aspect_ratio
    : 0.75;

  useEffect(() => {
    if (visible) enablePlaybackAudio();
  }, [visible]);

  const select = (pin: StonePin) => {
    if (selected?.id === pin.id) {
      deselect();
      return;
    }
    setSelected(pin);
    Animated.timing(cardY, { toValue: 0, duration: motion.state, useNativeDriver: true }).start();
    const path = pin.audio_url ?? pin.audio_path;
    if (!path) {
      setAudioUrl(null);
      return;
    }
    if (pin.audio_url) {
      setAudioUrl(pin.audio_url);
      return;
    }
    void signAudio(path).then((url) => {
      setAudioUrl(url);
    });
  };

  // Start playback once the source loads for the freshly selected pin.
  useEffect(() => {
    if (audioUrl) player.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  const deselect = () => {
    Animated.timing(cardY, { toValue: 1, duration: motion.state, useNativeDriver: true }).start(() =>
      setSelected(null),
    );
    player.pause();
    setAudioUrl(null);
  };

  const close = () => {
    player.pause();
    setSelected(null);
    setAudioUrl(null);
    onClose();
  };

  const W = frame?.width ?? 0;
  const H = frame?.height ?? 0;
  const cx = selected ? selected.x * W : 0;
  const cy = selected ? selected.y * H : 0;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={close} transparent={false}>
      <View style={styles.root}>
        <View style={styles.frameWrap}>
          <View style={[styles.frame, { aspectRatio: aspect }]} onLayout={(e) => setFrame(e.nativeEvent.layout)}>
            <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
            {/* Black dim → photo reads at 60%. Not opacity on the image. */}
            <View style={[StyleSheet.absoluteFill, styles.dim]} pointerEvents="none" />

            {/* Torch: a bright copy clipped to a circle, put back in register by
                the negative offset. */}
            {selected ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: cx - TORCH_R,
                  top: cy - TORCH_R,
                  width: TORCH_R * 2,
                  height: TORCH_R * 2,
                  borderRadius: TORCH_R,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: colors.accent50,
                }}
              >
                <Image
                  source={{ uri: imageUrl }}
                  style={{ position: 'absolute', left: -(cx - TORCH_R), top: -(cy - TORCH_R), width: W, height: H }}
                  contentFit="cover"
                />
              </View>
            ) : null}

            {/* Pins. */}
            {W > 0 &&
              stone.pins.map((pin, i) => (
                <Pressable
                  key={pin.id}
                  onPress={() => select(pin)}
                  hitSlop={12}
                  style={[
                    styles.pin,
                    {
                      left: pin.x * W - PIN / 2,
                      top: pin.y * H - PIN / 2,
                      backgroundColor: pin.unresolved ? colors.alert : colors.accent,
                    },
                    selected && selected.id !== pin.id && { opacity: 0.6 },
                  ]}
                >
                  <Text style={styles.pinNum}>{i + 1}</Text>
                </Pressable>
              ))}
          </View>
        </View>

        {/* Tap outside the card to deselect. */}
        {selected ? <Pressable style={styles.outside} onPress={deselect} /> : null}

        <Pressable onPress={close} hitSlop={12} style={styles.close}>
          <MonoLabel color={colors.textMuted}>✕ CLOSE</MonoLabel>
        </Pressable>

        {/* Note card. */}
        <Animated.View
          pointerEvents={selected ? 'auto' : 'none'}
          style={[
            styles.card,
            {
              transform: [
                {
                  translateY: cardY.interpolate({ inputRange: [0, 1], outputRange: [0, 400] }),
                },
              ],
            },
          ]}
        >
          {selected ? (
            <>
              <View style={styles.cardHeader}>
                <MonoLabel size="sm" color={selected.unresolved ? colors.alert : colors.accent}>
                  {selected.unresolved ? 'UNRESOLVED' : `PIN ${stone.pins.indexOf(selected) + 1}`}
                </MonoLabel>
                <MonoLabel size="xs" color={colors.t40}>
                  {`${authorName.toUpperCase()} · ${formatStamp(selected.created_at)}`}
                </MonoLabel>
              </View>
              <Text style={styles.cardBody}>
                {selected.note_text ?? selected.transcript ?? 'Voice note'}
              </Text>
            </>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, justifyContent: 'center' },
  frameWrap: { width: '100%' },
  frame: { width: '100%', backgroundColor: colors.surfaceSolid, overflow: 'hidden' },
  dim: { backgroundColor: '#000', opacity: 0.4 },
  pin: {
    position: 'absolute',
    width: PIN,
    height: PIN,
    borderRadius: PIN / 2,
    borderWidth: 1,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinNum: { ...type.monoTiny, color: colors.background, fontFamily: fonts.monoBold },
  outside: { ...StyleSheet.absoluteFillObject },
  close: { position: 'absolute', top: 56, left: s.gutter },
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.backgroundDeep,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: s.gutter,
    paddingTop: 22,
    paddingBottom: 44,
    minHeight: 160,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardBody: { ...type.body, fontSize: 16, color: colors.text, marginTop: 14 },
});
