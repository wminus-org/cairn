/**
 * Screen 11 — the share sheet, presented as a transparent Modal over the
 * transcription screen. All four tiles and the COPY badge go through
 * `Share.share` (no clipboard dependency).
 *
 * `transcript` must ONLY be passed when the server released it — the caller
 * hands in `null` for any band other than `unlocked`, and every share body
 * then falls back to title + public link.
 */
import { Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, type } from '../../theme';
import { MonoLabel } from '../../ui';

export interface ShareSheetProps {
  visible: boolean;
  onClose: () => void;
  noteId: string;
  title: string;
  /** Unlocked-band transcript, or null when the server withheld it. */
  transcript: string | null;
}

export function ShareSheet({ visible, onClose, noteId, title, transcript }: ShareSheetProps) {
  const link = `cairn.app/n/${noteId.slice(0, 7)}`;

  const share = async (message: string) => {
    try {
      await Share.share({ message });
    } catch {
      // The user dismissed the OS sheet — nothing to do.
    }
    onClose();
  };

  const fallback = `${title} — https://${link}`;

  const tiles: { label: string; message: string }[] = [
    {
      label: 'TEXT + AUDIO LINK',
      message: transcript
        ? `${title}\n\n${transcript}\n\nListen: https://${link}`
        : fallback,
    },
    { label: 'TRANSCRIPT ONLY', message: transcript ?? fallback },
    { label: 'PIN TO PROJECT', message: `Pin "${title}" — https://${link}` },
    {
      label: 'EXPORT PDF',
      message: transcript ? `${title}\n\n${transcript}` : fallback,
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        {/* Dims the note behind to ~0.35 visibility. */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <MonoLabel size="md" color={colors.t45} style={styles.heading}>
            SHARE THIS NOTE
          </MonoLabel>

          <View style={styles.grid}>
            {tiles.map((tile) => (
              <Pressable
                key={tile.label}
                style={({ pressed }) => [styles.tile, pressed && { opacity: 0.7 }]}
                onPress={() => void share(tile.message)}
              >
                <Text style={styles.tileLabel}>{tile.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.linkRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <MonoLabel size="sm" color={colors.accent}>
                PUBLIC LINK
              </MonoLabel>
              <Text style={styles.linkText} numberOfLines={1}>
                {link}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.copyBadge, pressed && { opacity: 0.7 }]}
              onPress={() => void share(`https://${link}`)}
            >
              <Text style={styles.copyLabel}>COPY</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9, 28, 30, 0.65)',
  },
  sheet: {
    backgroundColor: colors.backgroundDeep,
    borderTopWidth: 1,
    borderTopColor: 'rgba(234, 230, 218, 0.2)',
    paddingTop: 24,
    paddingHorizontal: 22,
    paddingBottom: 44,
  },
  grabber: {
    width: 44,
    height: 3,
    backgroundColor: 'rgba(234, 230, 218, 0.3)',
    alignSelf: 'center',
  },
  heading: { marginTop: 20 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    marginTop: 16,
  },
  tile: {
    flexBasis: '49%',
    flexGrow: 1,
    backgroundColor: colors.surfaceSolid,
    borderWidth: 1,
    borderColor: colors.t18,
    padding: 16,
  },
  tileLabel: {
    ...type.monoSmall,
    color: colors.text,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    borderWidth: 1,
    borderColor: colors.accent50,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  linkText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 16,
    color: colors.t60,
    marginTop: 4,
  },
  copyBadge: {
    backgroundColor: colors.accent,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  copyLabel: {
    ...type.monoSmall,
    fontFamily: fonts.monoBold,
    color: colors.background,
  },
});
