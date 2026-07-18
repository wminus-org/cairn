/**
 * One stone in the thread: a mark on the spine, a byline, an absolute mono
 * timestamp, and a body chosen by `kind`.
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
 *
 * ── THE SPINE ────────────────────────────────────────────────────────────────
 * A cairn is a conversation held at a coordinate over time, and a chat app draws
 * that as bubbles. This draws it as the object: one 12% hairline running down
 * the left of the whole thread, a stone-shaped node on it per contribution, and
 * a wider base stone under the oldest one where the stack meets the ground. The
 * line is load-bearing — it is the only thing on the screen that says these
 * entries are stacked rather than listed — and at 1pt it costs no ink.
 *
 * The node also carries `kind`, which is why there are no icons anywhere here.
 * Three marks built from the one primitive the design system allows: a tapering
 * stack (voice), two rules (text), a hollow frame (photo). Distinct silhouettes
 * at 11pt, no icon set, and every one of them still legible to VoiceOver via the
 * node's own accessibility label — the shape is never the only carrier.
 */
import { BlurView } from 'expo-blur';
import { memo, useMemo } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import StoneWaveform from './StoneWaveform';
import { formatStoneTimestamp } from './band';
import { redactedLineWidths } from './stoneStack';
import { stonePinCount, type CairnStone, type StonePin } from '../lib/cairnApi';
import { colors, palette, s, type } from '../theme';

/**
 * The thread screen owns one player for the whole list (starting a second stone
 * must stop the first) and hands each row either `null` or this. The play
 * control appears, and the waveform recolors left to right.
 */
export interface StonePlayback {
  isPlaying: boolean;
  /** 0–1 through the clip. Drives the waveform's amber fill. */
  progress: number;
  onToggle: () => void;
}

/**
 * The approach-band treatment. `null` means render at full strength.
 *
 * `opacity` is an Animated node rather than a number so the 400ms distance ease
 * runs on the native driver and never re-renders a row: GPS jitter has to read
 * as breathing, and eleven rows re-rendering at 60fps to fake that would read as
 * stutter instead. `blur` is a plain number because `intensity` is a prop, not a
 * style — the screen quantises it so a whole sweep costs a handful of renders.
 */
export interface StoneDegrade {
  /** expo-blur intensity, 0–100. */
  blur: number;
  /** Fades the synthesised stack in over 200 → 180m so the edge is not a pop. */
  opacity: Animated.AnimatedInterpolation<number>;
}

export interface StoneRowProps {
  stone: CairnStone;
  /** The server's word, passed down rather than re-derived per row. */
  unlocked: boolean;
  degrade?: StoneDegrade | null;
  playback?: StonePlayback | null;
  /** Newest stone. The spine starts at its node rather than running off the top. */
  isNewest?: boolean;
  /** Oldest stone. The spine terminates on a base stone: the bottom of the stack. */
  isOldest?: boolean;
}

/** Photo stones with no aspect ratio yet still need a box of some shape. */
const DEFAULT_ASPECT = 4 / 3;

/** Spine geometry. The rail is narrow on purpose — it must not eat the measure. */
const RAIL_W = 12;
const RAIL_GAP = 12;
/** Centre of the 1pt line, and of every node drawn on it. */
const LINE_X = 5.5;
/** Vertical centre of the mono byline (lineHeight 18), so nodes sit on the name. */
const NODE_CY = 9;

function StoneRow({
  stone,
  unlocked,
  degrade = null,
  playback = null,
  isNewest = false,
  isOldest = false,
}: StoneRowProps) {
  const pins = stonePinCount(stone);

  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        {/* One hairline, drawn per row and bled `-s.thread` into the gap below,
            so the thread reads as a single continuous line without a parent
            that has to know how tall its children turned out to be. */}
        <View
          style={[
            styles.spine,
            { top: isNewest ? NODE_CY : 0, bottom: isOldest ? BASE_H + s.unit : -s.thread },
          ]}
        />
        <KindNode kind={stone.kind} />
        {isOldest ? <View style={styles.baseStone} /> : null}
      </View>

      <View style={styles.content}>
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
          <Animated.View style={degrade ? { opacity: degrade.opacity } : undefined}>
            <StoneBody stone={stone} unlocked={unlocked} pins={pins} playback={playback} />
          </Animated.View>

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
    </View>
  );
}

/**
 * The kind mark on the spine. Geometry only — the app has no icon set, and
 * these are the three shapes it is already allowed to draw.
 */
function KindNode({ kind }: { kind: CairnStone['kind'] }) {
  if (kind === 'photo') {
    return (
      <View
        style={[styles.node, styles.nodeFrame]}
        accessibilityRole="image"
        accessibilityLabel="Photo stone"
      />
    );
  }

  if (kind === 'text') {
    return (
      <View style={[styles.node, styles.nodeRules]} accessibilityRole="image" accessibilityLabel="Text stone">
        <View style={styles.nodeRule} />
        <View style={styles.nodeRule} />
      </View>
    );
  }

  return (
    <View style={[styles.node, styles.nodeStack]} accessibilityRole="image" accessibilityLabel="Voice stone">
      <View style={[styles.nodeStone, { width: 11 }]} />
      <View style={[styles.nodeStone, { width: 8 }]} />
      <View style={[styles.nodeStone, { width: 5 }]} />
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
    return <PhotoStone stone={stone} unlocked={unlocked} pins={pins} />;
  }

  if (unlocked && stone.body_text) {
    return <Text style={styles.text}>{stone.body_text}</Text>;
  }

  return <RedactedMass stoneId={stone.id} />;
}

/**
 * A text stone the server withheld. Bars in the shape of a paragraph, ragged
 * last line included — form degraded, not content faked. Nothing here is
 * derived from the sentence, because the sentence is not in the payload.
 */
function RedactedMass({ stoneId }: { stoneId: string }) {
  const widths = useMemo(() => redactedLineWidths(stoneId), [stoneId]);
  return (
    <View style={styles.redacted} accessibilityLabel="Withheld until you are standing here">
      {widths.map((width, i) => (
        <View key={i} style={[styles.redactedLine, { width: `${Math.round(width * 100)}%` }]} />
      ))}
    </View>
  );
}

/**
 * The photo slot, and the pins on it.
 *
 * There is no image yet in any band — `image_path` is a private storage path the
 * client cannot sign — so the slot is a contour frame held at the stone's real
 * aspect ratio. What *is* real once unlocked is the pin set: normalized 0–1
 * coordinates, which is the whole B2B claim ("the leak is *there*, on that
 * valve"). Positioning them as percentages means they land correctly without
 * waiting on an onLayout pass, and they are deliberately not clipped — a pin at
 * x = 0.98 should hang off the edge rather than be cut in half.
 */
function PhotoStone({
  stone,
  unlocked,
  pins,
}: {
  stone: CairnStone;
  unlocked: boolean;
  pins: number;
}) {
  // Creation order, which is the order pin numbers were assigned in.
  const ordered = useMemo<StonePin[]>(() => {
    if (!unlocked || !stone.pins) return [];
    return [...stone.pins].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }, [stone.pins, unlocked]);

  const unresolved = ordered.filter((pin) => pin.unresolved).length;

  return (
    <View>
      <View style={[styles.photoSlot, { aspectRatio: stone.image_aspect_ratio || DEFAULT_ASPECT }]}>
        {ordered.map((pin, i) => (
          <PhotoPin key={pin.id} pin={pin} index={i + 1} />
        ))}
      </View>

      {pins > 0 ? (
        <View style={styles.pinSummary}>
          <Text style={styles.meta}>{`${pins} ${pins === 1 ? 'pin' : 'pins'}`}</Text>
          {/* Terracotta AND the word. The flag must survive a colourblind viewer,
              a sunlit screen and a projector that eats saturation. */}
          {unresolved > 0 ? (
            <>
              <Text style={styles.meta}>·</Text>
              <Text style={styles.unresolvedLabel}>unresolved</Text>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const PIN = 24;

function PhotoPin({ pin, index }: { pin: StonePin; index: number }) {
  return (
    <View
      style={[
        styles.pin,
        pin.unresolved ? styles.pinUnresolved : styles.pinResolved,
        {
          left: `${Math.round(Math.min(1, Math.max(0, pin.x)) * 100)}%`,
          top: `${Math.round(Math.min(1, Math.max(0, pin.y)) * 100)}%`,
        },
      ]}
      accessibilityRole="image"
      accessibilityLabel={
        pin.unresolved ? `Pin ${index}, unresolved` : `Pin ${index}`
      }
    >
      <Text style={styles.pinIndex}>{String(index)}</Text>
      {/* A halo, not a hue. Geometry is what separates unresolved from resolved
          when the colour is gone. */}
      {pin.unresolved ? <View style={styles.pinHalo} pointerEvents="none" /> : null}
    </View>
  );
}

/** Base stone under the oldest entry: the bottom of the stack, on the ground. */
const BASE_W = 14;
const BASE_H = 5;

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },

  // --- spine ---------------------------------------------------------------
  rail: { width: RAIL_W },
  spine: { position: 'absolute', left: LINE_X, width: 1, backgroundColor: colors.hairline },
  node: { position: 'absolute', left: 0, width: RAIL_W, alignItems: 'center' },
  nodeStack: { top: NODE_CY - 6, flexDirection: 'column-reverse', gap: 1 },
  nodeStone: { height: 3, borderRadius: s.r.stone, backgroundColor: colors.t60 },
  nodeRules: { top: NODE_CY - 3, gap: 3 },
  nodeRule: { width: 11, height: 2, borderRadius: s.r.stone, backgroundColor: colors.t60 },
  nodeFrame: {
    top: NODE_CY - 5,
    left: (RAIL_W - 11) / 2,
    width: 11,
    height: 10,
    borderWidth: 1,
    borderColor: colors.t60,
    borderRadius: s.r.stone,
    backgroundColor: palette.base,
  },
  baseStone: {
    position: 'absolute',
    bottom: 0,
    left: LINE_X + 0.5 - BASE_W / 2,
    width: BASE_W,
    height: BASE_H,
    borderRadius: s.r.stone,
    backgroundColor: colors.t20,
  },

  // --- content -------------------------------------------------------------
  content: { flex: 1, marginLeft: RAIL_GAP, gap: s.unit },
  byline: { flexDirection: 'row', alignItems: 'center', gap: s.unit * 1.5 },
  meta: { ...type.mono, color: colors.textFaint, flexShrink: 1 },
  unresolvedLabel: { ...type.mono, color: colors.unresolved },
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

  // Two type sizes on this screen: `display` for the title, `body` for
  // everything else. A transcript is body at 60% — emphasis is opacity here,
  // never a third size.
  transcript: { ...type.body, color: colors.t60, marginTop: s.unit },
  text: { ...type.body, color: colors.text },

  redacted: { gap: 6 },
  redactedLine: { height: 14, borderRadius: s.r.stone, backgroundColor: colors.t20 },

  photoSlot: {
    width: '100%',
    borderRadius: s.r.chip,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  pinSummary: { flexDirection: 'row', alignItems: 'center', gap: s.unit, marginTop: s.unit },
  pin: {
    position: 'absolute',
    width: PIN,
    height: PIN,
    borderRadius: PIN / 2,
    marginLeft: -PIN / 2,
    marginTop: -PIN / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.base,
  },
  // Amber here is sanctioned: a resolved photo pin is one of its five uses.
  pinResolved: { backgroundColor: colors.accent },
  pinUnresolved: { backgroundColor: colors.unresolved },
  pinHalo: {
    position: 'absolute',
    left: -5,
    top: -5,
    right: -5,
    bottom: -5,
    borderRadius: (PIN + 10) / 2,
    borderWidth: 1,
    borderColor: colors.unresolved,
  },
  pinIndex: { ...type.mono, color: palette.base, includeFontPadding: false },
});

export default memo(StoneRow);
