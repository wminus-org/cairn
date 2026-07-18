/**
 * One stone in the thread: a byline, an absolute mono timestamp, and a body
 * chosen by `kind`.
 *
 * THE ROW NEVER DECIDES WHAT IS VISIBLE. It renders what the server sent. In
 * the approach band `body_text`, `transcript` and the media paths are not
 * merely null — the keys are absent, because `cairn_detail` builds a five-key
 * stub rather than nulling a full object. So the "locked" look here is a
 * skeleton in the shape of the missing thing plus a blur over a stack the
 * client synthesised itself, not real content with a filter on top. There is
 * nothing to leak because nothing arrived.
 *
 * `degrade` is that treatment, precomputed once per fetch by the screen so
 * twenty rows do not each recompute the same curve.
 */
import { BlurView } from 'expo-blur';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import StoneWaveform from './StoneWaveform';
import { formatStoneTimestamp } from './band';
import { stonePinCount, type CairnStone } from '../lib/cairnApi';
import { colors, s, type } from '../theme';

/**
 * THE PLAYBACK SEAM. Nothing constructs this yet — the audio signing route is
 * landing in parallel, and until it does a client holds a storage path it
 * cannot turn into a sound.
 *
 * When it lands, the thread screen owns one player for the whole list (starting
 * a second stone must stop the first) and hands each row either `null` or this.
 * Everything below already keys off it: the play control appears, and the
 * waveform recolors left to right. No other file needs to change.
 */
export interface StonePlayback {
  isPlaying: boolean;
  /** 0–1 through the clip. Drives the waveform's amber fill. */
  progress: number;
  onToggle: () => void;
}

/** The approach-band treatment. `null` means render at full strength. */
export interface StoneDegrade {
  /** expo-blur intensity, 0–100. */
  blur: number;
  /** Fades the synthesised stack in over 200 → 180m so the edge is not a pop. */
  opacity: number;
}

export interface StoneRowProps {
  stone: CairnStone;
  /** The server's word, passed down rather than re-derived per row. */
  unlocked: boolean;
  degrade?: StoneDegrade | null;
  playback?: StonePlayback | null;
}

/** Photo stones with no aspect ratio yet still need a box of some shape. */
const DEFAULT_ASPECT = 4 / 3;

function StoneRow({ stone, unlocked, degrade = null, playback = null }: StoneRowProps) {
  const pins = stonePinCount(stone);

  return (
    <View style={styles.row}>
      <View style={styles.byline}>
        {/* Never a raw uuid and never blank: `cairn_detail` resolves the name
            inside the SECURITY DEFINER function, because a PostgREST join to
            `profiles` returns null for rows RLS hides and reports it as data
            rather than as an error. */}
        <Text style={styles.meta} numberOfLines={1}>
          {stone.author_name || 'Someone'}
        </Text>
        <Text style={styles.meta}>{formatStoneTimestamp(stone.created_at)}</Text>
      </View>

      <View style={styles.body}>
        <View style={{ opacity: degrade ? degrade.opacity : 1 }}>
          <StoneBody stone={stone} unlocked={unlocked} pins={pins} playback={playback} />
        </View>

        {/* Blur sits over the body rather than being baked into it, so the same
            subtree renders in both bands and crossing the radius is a fade of
            one overlay instead of a swap of two component trees. */}
        {degrade && degrade.blur > 0 ? (
          <BlurView
            intensity={degrade.blur}
            tint="dark"
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        ) : null}
      </View>
    </View>
  );
}

function StoneBody({
  stone,
  unlocked,
  pins,
  playback,
}: {
  stone: CairnStone;
  unlocked: boolean;
  pins: number;
  playback: StonePlayback | null;
}) {
  if (stone.kind === 'voice') {
    return (
      <View>
        <View style={styles.voiceRow}>
          {/* The seam: `playback` is null everywhere today, so no control is
              drawn and the waveform sits settled. */}
          {playback ? (
            <Pressable
              onPress={playback.onToggle}
              hitSlop={s.unit}
              style={styles.playTarget}
              accessibilityRole="button"
              accessibilityLabel={playback.isPlaying ? 'Stop this stone' : 'Play this stone'}
            >
              {playback.isPlaying ? <View style={styles.stopGlyph} /> : <View style={styles.playGlyph} />}
            </Pressable>
          ) : null}
          <StoneWaveform stoneId={stone.id} progress={playback ? playback.progress : null} />
        </View>

        {/* DEMO.md's stated fallback: if the room is loud or the audio will not
            play, the thread still reads. Only ever present when unlocked. */}
        {unlocked && stone.transcript ? (
          <Text style={styles.transcript}>{stone.transcript}</Text>
        ) : null}
      </View>
    );
  }

  if (stone.kind === 'photo') {
    return (
      <View>
        {/* Placeholder until CRN-012/CRN-014. There is no thumbnail to show even
            when unlocked: `image_path` is a storage path in a private bucket and
            the client has no way to sign it. */}
        <View style={[styles.photoSlot, { aspectRatio: stone.image_aspect_ratio || DEFAULT_ASPECT }]} />
        {pins > 0 ? <Text style={styles.meta}>{`${pins} ${pins === 1 ? 'pin' : 'pins'}`}</Text> : null}
      </View>
    );
  }

  if (unlocked && stone.body_text) {
    return <Text style={styles.text}>{stone.body_text}</Text>;
  }

  // A withheld text stone. Two 20% bars in the shape of the sentence that is
  // not here — a skeleton, never a spinner.
  return (
    <View style={styles.textSkeleton}>
      <View style={styles.skeletonLine} />
      <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: s.unit },
  byline: { flexDirection: 'row', alignItems: 'center', gap: s.unit * 1.5 },
  meta: { ...type.mono, color: colors.textFaint, flexShrink: 1 },
  // `overflow: hidden` keeps the blur overlay clipped to the body; without it
  // the absolute fill can spill over the gap into the next stone.
  body: { overflow: 'hidden', borderRadius: s.r.chip },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: s.unit * 1.5 },
  playTarget: { width: s.tap, height: s.tap, alignItems: 'center', justifyContent: 'center' },
  // Drawn, not imported. The app has three glyphs and no icon set.
  playGlyph: {
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftWidth: 12,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.t100,
  },
  stopGlyph: { width: 12, height: 12, backgroundColor: colors.t100, borderRadius: s.r.stone },
  transcript: { ...type.small, color: colors.t60, marginTop: s.unit, maxWidth: '100%' },
  text: { ...type.body, color: colors.text },
  textSkeleton: { gap: s.unit },
  skeletonLine: { height: 10, borderRadius: s.r.stone, backgroundColor: colors.t20 },
  skeletonLineShort: { width: '62%' },
  photoSlot: { width: '100%', borderRadius: s.r.chip, backgroundColor: colors.t20 },
});

export default memo(StoneRow);
