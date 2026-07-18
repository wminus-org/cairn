/**
 * Hold to speak. Release to stop.
 *
 * This component owns recording and nothing else. It does not upload, does not
 * know Supabase exists, and does not play anything back — it hands a local file
 * URI up and forgets about it. CRN-011 does the rest.
 *
 * The waveform is the point. It is not a bar chart and not a mirrored
 * audiogram: every syllable loud enough to clear the threshold drops one stone
 * onto a pile that grows upward off a baseline. Slightly uneven widths, because
 * a cairn built of identical blocks reads as a spreadsheet.
 *
 * expo-audio, not expo-av. The surface used here was read off
 * node_modules/expo-audio/build rather than remembered: useAudioRecorder ->
 * prepareToRecordAsync() -> record() -> stop(), status via getStatus().
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { File } from 'expo-file-system';

import { alpha, colors, motion, palette, s, type } from '../theme';

/** Hard cap. The recorder stops itself here as if the finger had lifted. */
const MAX_MS = 60_000;

/** Start counting down out loud only when it is about to matter. */
const COUNTDOWN_FROM_MS = 10_000;

/**
 * Anything shorter than this is a fumbled tap, not a thought. The ticket's
 * acceptance test taps for 200ms and expects no file, so the cutoff sits above
 * that rather than on top of it — a threshold you are meant to fail should not
 * be a coin flip.
 */
const MIN_KEEP_MS = 400;

/** Metering cadence. Fast enough to catch a syllable, slow enough to not churn. */
const SAMPLE_MS = 90;

/**
 * Metering is dBFS: logarithmic, floored somewhere around -160/-60, 0 at
 * clipping. Fed raw into a height it produces a waveform that is either dead
 * flat or permanently pinned. Squash it to 0..1 against a -60dB floor first.
 */
function normalise(db: number): number {
  if (!Number.isFinite(db)) return 0;
  const v = (db + 60) / 60;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Above this, a sample is a syllable and earns a stone. Room-tuned by ear. */
const STONE_THRESHOLD = 0.22;

const STONE_H = 5;
const STONE_GAP = 3;
/** Design system: 18–34pt, keyed to amplitude. Nothing outside that range. */
const STONE_W_MIN = 18;
const STONE_W_MAX = 34;

/**
 * The column is bounded, not a window. Sixty seconds of speech is hundreds of
 * stones and no phone-sized container holds them, so at the cap adjacent pairs
 * merge into one stone of their average width and the stack halves in place —
 * it compresses its own history rather than scrolling it off the top, which is
 * what keeps the column height fixed and the whole take on screen. Every raw
 * sample still survives in `levelsRef` for the handoff.
 */
const MAX_STONES = 40;
/**
 * Reserved up front — 323pt — so the stack grows upward into space that is
 * already there instead of shoving the record button down the screen mid-take.
 * It is a tall block, and a host that cannot spare it has to scroll or shrink
 * around this component rather than let the column jump.
 */
const WAVE_H = MAX_STONES * (STONE_H + STONE_GAP) + STONE_GAP;

/**
 * The ground the cairn is built on, and the width the sixty-second fill runs
 * across. Wider than the widest stone (34pt) by enough that the column always
 * reads as sitting *on* something rather than balanced on a line its own size.
 */
const GROUND_W = 120;

/**
 * 72pt: the 44pt minimum tap target plus enough ring that a thumb resting on it
 * does not cover the whole control. The hit target is the button itself, so
 * there is no hitSlop to keep in sync.
 */
const BUTTON_D = 72;

/**
 * Fixed jitter table, in points — deterministic, so a stone never twitches on
 * re-render. It offsets the stone sideways and never scales it: width is the
 * only thing carrying amplitude, and jitter in the width is exactly how a
 * centred column starts reading as the mirrored audiogram the ticket rejects.
 */
const JITTER = [0, 2, -1, 2, -2, 1, -2, 1];

/**
 * The second half of the irregularity, and the half that gives a stone weight:
 * a fraction of a degree of tilt, seeded off the same seq so it is as stable as
 * the jitter. At two degrees on a 5pt slab the corner lifts about half a point —
 * you do not read it as rotation, you read it as a stone that did not land flat.
 * Coprime with JITTER's length on purpose, so tilt and offset do not fall into a
 * visible eight-stone repeat.
 */
const TILT = [0, -1.6, 0.9, 2, -0.7, 1.4, -2, 0.5, 1.1, -1.2, 1.8, -0.4, 0.7];

function stoneWidth(level: number): number {
  const w = STONE_W_MIN + level * (STONE_W_MAX - STONE_W_MIN);
  return Math.round(w < STONE_W_MIN ? STONE_W_MIN : w > STONE_W_MAX ? STONE_W_MAX : w);
}

type Stone = { seq: number; w: number; dx: number; rot: number };

/**
 * At the cap, fold the stack in half: each pair becomes one stone at their mean
 * width. Keys survive because the merged stone inherits the older seq, and
 * every seq in the column is still distinct. The merged stone keeps the older
 * stone's offset and tilt rather than averaging them — a stone that settles has
 * a pose, and averaging two poses walks the whole column toward straight every
 * time the stack folds.
 */
function mergePairs(stones: Stone[]): Stone[] {
  const merged: Stone[] = [];
  for (let i = 0; i < stones.length; i += 2) {
    const a = stones[i];
    const b = stones[i + 1] ?? a;
    merged.push({ seq: a.seq, w: Math.round((a.w + b.w) / 2), dx: a.dx, rot: a.rot });
  }
  return merged;
}

/**
 * One stone, landing.
 *
 * It arrives from above — one stone-pitch up, translucent and narrow — and
 * settles into its place and its full width over 200ms ease-out. That is the
 * whole animation: no spring, no bounce, no overshoot. A stone set down by hand
 * decelerates and stops.
 *
 * `memo` matters more than it looks. The parent re-renders every 90ms while the
 * mic is open, and the entry animation is keyed to mount — so re-rendering a
 * settled stone is not just wasted work, it is the thing that would make the
 * whole column twitch. The props are all primitives, and `tint` is a constant
 * string for the first 55 seconds, so in practice a settled stone renders once.
 */
const FallingStone = memo(function FallingStone({
  w,
  dx,
  rot,
  tint,
}: {
  w: number;
  dx: number;
  rot: number;
  tint: string;
}) {
  const land = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(land, {
      toValue: 1,
      duration: motion.state,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [land]);

  return (
    <Animated.View
      style={[
        styles.stone,
        {
          width: w,
          backgroundColor: tint,
          opacity: land,
          transform: [
            // Jitter as an offset on a fixed-width stone: the column edge is
            // what wanders, not the stone's weight.
            { translateX: dx },
            {
              translateY: land.interpolate({
                inputRange: [0, 1],
                outputRange: [-(STONE_H + STONE_GAP), 0],
              }),
            },
            // Narrow on the way down, full width once it is bearing load. Only
            // scaleX — a stone that squashed vertically would be rubber.
            {
              scaleX: land.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }),
            },
            { rotate: `${rot}deg` },
          ],
        },
      ]}
    />
  );
});

/** The column tints toward terracotta over the last five seconds. */
const TINT_FROM_MS = 55_000;

/** Channels read off the palette rather than a sixth hex literal in this file. */
function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const AMBER = channels(palette.amber);
const TERRACOTTA = channels(palette.terracotta);
const BONE = channels(palette.bone);

/** 0 until the last five seconds, then 0 → 1 across them. */
function tintK(elapsedMs: number): number {
  const raw = (elapsedMs - TINT_FROM_MS) / (MAX_MS - TINT_FROM_MS);
  return raw < 0 ? 0 : raw > 1 ? 1 : raw;
}

/**
 * The same information as the countdown, in the place the eye already is. It
 * reads as the take running out rather than as an error — which is why it is a
 * gradient into the stones and not a line of red copy.
 */
function stoneColor(elapsedMs: number): string {
  const k = tintK(elapsedMs);
  if (k === 0) return palette.amber;
  const [r, g, b] = AMBER.map((c, i) => Math.round(c + (TERRACOTTA[i] - c) * k));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * The ground line under the stack doubles as the take running out: it fills
 * left to right across the sixty seconds, so the cap is visible from the first
 * second instead of arriving as a countdown at the end.
 *
 * It is bone at 40% — the metadata rung — not amber, because amber means the
 * mic is live and it is already spent on the stones. Over the last five seconds
 * it walks to terracotta on exactly the same curve the stones do: one signal
 * said twice, in the two places the eye already is.
 */
function groundColor(elapsedMs: number): string {
  const k = tintK(elapsedMs);
  if (k === 0) return colors.t40;
  const [r, g, b] = BONE.map((c, i) => Math.round(c + (TERRACOTTA[i] - c) * k));
  const a = (alpha.meta + (alpha.full - alpha.meta) * k).toFixed(2);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * AC4 is "the local recordings directory is unchanged afterwards", and
 * expo-audio has already written a file by the time anyone knows the hold was
 * too short. Declining to hand the URI on is not the same as not leaving a
 * file, so a discard deletes.
 *
 * The current expo-file-system surface (File), not legacy deleteAsync —
 * supabase.ts already imports it. `delete()` is synchronous and throws on a
 * missing file, hence the `exists` guard.
 */
function discardFile(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A stranded temp file is not worth failing a release over.
  }
}

export type RecordingResult = {
  uri: string;
  durationMs: number;
  /**
   * Every normalised sample, threshold or not. CRN-011 passes this in memory so
   * the stone that was just recorded renders its real shape — the schema has
   * nowhere to persist it.
   */
  levels: number[];
};

export type HoldToRecordProps = {
  onComplete: (result: RecordingResult) => void;
  /**
   * A take that came to nothing — a fumbled tap, or a recorder that would not
   * start. The caller is expected to stay exactly where it is and say nothing;
   * the control has already returned itself to idle.
   */
  onCancel: () => void;
  /**
   * The user walking away from the mic-denial panel, which is a different event
   * from a discarded take and cannot share `onCancel`'s silence — a button that
   * does nothing is what stranded them there. Optional so the denial panel still
   * dismisses itself when a caller has nowhere to go back to.
   */
  onDismiss?: () => void;
};

/** What the control is doing. `stopping` exists to swallow a double release. */
type Phase = 'idle' | 'arming' | 'recording' | 'stopping';

const RECORDING_OPTIONS: RecordingOptions = {
  // Spread the preset rather than hand-rolling the iOS format enum: it already
  // pins .m4a/MPEG4AAC correctly, and mistyping `'aac '` (trailing space) is a
  // silent empty-file bug. Mono at 64kbps because this is speech, not music.
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
  numberOfChannels: 1,
  bitRate: 64_000,
};

/**
 * Exported both ways on purpose: the capture sheet imports this by name, and a
 * default-only export is a merge conflict waiting to happen on a build day.
 */
export function HoldToRecord({ onComplete, onCancel, onDismiss }: HoldToRecordProps) {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);

  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [phase, setPhase] = useState<Phase>('idle');
  const [stones, setStones] = useState<Stone[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const levelsRef = useRef<number[]>([]);
  const seqRef = useRef(0);
  /**
   * Phase as a ref as well as state. The sampling interval and the async
   * arming path both need to read it without waiting for a render, and a stale
   * closure here is how you get stones landing on a finished recording.
   */
  const phaseRef = useRef<Phase>('idle');
  /**
   * Unmounting does not move the phase, so the phase guards in `begin` cannot
   * see it. Without this, a sheet dismissed while the permission dialog is up
   * resumes onto a released native recorder and installs a sampling interval
   * that the cleanup has already run past and will never clear.
   */
  const mountedRef = useRef(true);

  const setPhaseBoth = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  /**
   * Read the phase through a call rather than touching `phaseRef.current`
   * inline. TypeScript narrows the ref on first comparison and never widens it
   * again across an `await` — it cannot see that setPhaseBoth reassigns it — so
   * inline reads make every later guard look like dead code. This is a
   * type-system workaround, not indirection for its own sake.
   */
  const readPhase = useCallback((): Phase => phaseRef.current, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * Hand the hardware back. Every abort after the session went into record mode
   * comes through here, including the ones that never reached `record()`: an
   * armed recorder has already opened its file, and a session left with
   * allowsRecording on is why playback afterwards comes out thin or routed to
   * the earpiece — which reads as an upload bug for half an hour before anyone
   * suspects the session.
   */
  const standDown = useCallback(
    async (armedUri?: string | null) => {
      try {
        await recorder.stop();
      } catch {
        // Never started, already stopped, or released out from under us. The
        // session has to go back regardless.
      }
      // Only the file this pass armed, passed in by the caller — never
      // `recorder.uri` read fresh. That property still points at the last
      // completed take until the next prepare, and the sheet may be uploading
      // it right now.
      discardFile(armedUri);
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    },
    [recorder],
  );

  useEffect(() => {
    let alive = true;
    void getRecordingPermissionsAsync().then((res) => {
      if (alive) setPermission(res.granted ? 'granted' : 'unknown');
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Stop path. Owns the timer it kills — same function that stops the recorder,
   * per the trap in the ticket, so there is no route where the interval
   * outlives the recording.
   */
  const finish = useCallback(async () => {
    if (readPhase() !== 'recording') return;
    setPhaseBoth('stopping');
    clearTimer();

    // Read duration and URL *before* stop(); the recorder is entitled to reset
    // its own status once it has finished writing the file.
    const pre = recorder.getStatus();
    const wallMs = Date.now() - startedAtRef.current;

    try {
      await recorder.stop();
    } catch {
      // A recorder that refuses to stop cleanly has nothing to hand on. Fall
      // through to the discard path rather than shipping a half-written file.
    }

    // Put the iOS session back. Leaving allowsRecording on is why playback
    // later comes out thin or routed to the earpiece, and it reads as an
    // upload bug for half an hour before anyone suspects the session.
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

    const uri = recorder.uri ?? pre.url;
    const durationMs = pre.durationMillis > 0 ? pre.durationMillis : wallMs;
    const levels = levelsRef.current;

    setPhaseBoth('idle');
    setElapsedMs(0);
    setStones([]);
    levelsRef.current = [];

    if (!uri || durationMs < MIN_KEEP_MS) {
      // The recorder ran, however briefly, so there is a file. AC4 checks the
      // recordings directory, not the handoff — a fumbled tap has to leave the
      // disk as it found it.
      discardFile(uri);
      onCancel();
      return;
    }
    onComplete({ uri, durationMs, levels });
  }, [clearTimer, onCancel, onComplete, readPhase, recorder, setPhaseBoth]);

  const begin = useCallback(async () => {
    if (readPhase() !== 'idle') return;
    setPhaseBoth('arming');

    let granted = permission === 'granted';
    if (!granted) {
      const res = await requestRecordingPermissionsAsync();
      if (!mountedRef.current) return;
      granted = res.granted;
      setPermission(granted ? 'granted' : 'denied');
    }
    if (!granted) {
      // Back to idle, not stuck mid-record. The denial copy takes over below.
      setPhaseBoth('idle');
      return;
    }

    // The finger may already be gone — permission dialogs are slow and a press
    // is not. Bail before touching the recorder rather than starting one that
    // nobody is holding.
    if (readPhase() !== 'arming') return;

    // The file this pass opens, so an abort deletes that one and only that one.
    let armedUri: string | null = null;
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      // Past this line the session is in record mode, so every exit from this
      // block — unmounted, released, thrown — goes through standDown. Returning
      // bare from here is the leak: the phase says idle, the control looks
      // idle, and the device is still in record mode.
      if (!mountedRef.current) {
        await standDown();
        return;
      }
      // Prepare and record are two calls. Skipping prepare throws nothing and
      // yields an empty file — the classic silent failure.
      //
      // No argument on purpose. useAudioRecorder already ran RECORDING_OPTIONS
      // through createRecordingOptions, which lifts the `ios` block up to the
      // top level where the native Record reads outputFormat and audioQuality.
      // prepareToRecordAsync is the raw native call and does no such lifting,
      // so handing it the nested JS shape drops the format, AVAudioRecorder
      // init throws, and prepare fails as a hold that simply never starts.
      // Passing nothing keeps the recorder configured at construction.
      await recorder.prepareToRecordAsync();
      armedUri = recorder.uri;
      if (!mountedRef.current || readPhase() !== 'arming') {
        // Armed with nobody holding it. `release` already put the phase back
        // and told the caller — it cannot reach the hardware, and this is the
        // one path where the recorder is prepared and will never be started.
        await standDown(armedUri);
        return;
      }
      recorder.record();
    } catch {
      await standDown(armedUri);
      setPhaseBoth('idle');
      onCancel();
      return;
    }

    startedAtRef.current = Date.now();
    levelsRef.current = [];
    seqRef.current = 0;
    setStones([]);
    setElapsedMs(0);
    setPhaseBoth('recording');

    timerRef.current = setInterval(() => {
      if (readPhase() !== 'recording') return;

      const status = recorder.getStatus();
      const level = normalise(status.metering ?? -160);
      levelsRef.current.push(level);

      if (level >= STONE_THRESHOLD) {
        const seq = seqRef.current++;
        const stone: Stone = {
          seq,
          w: stoneWidth(level),
          dx: JITTER[seq % JITTER.length],
          rot: TILT[seq % TILT.length],
        };
        setStones((prev) => [...(prev.length >= MAX_STONES ? mergePairs(prev) : prev), stone]);
      }

      const ms = Date.now() - startedAtRef.current;
      setElapsedMs(ms);
      if (ms >= MAX_MS) void finish();
    }, SAMPLE_MS);
  }, [finish, onCancel, permission, readPhase, recorder, setPhaseBoth, standDown]);

  const release = useCallback(() => {
    if (readPhase() === 'arming') {
      // Released while the permission sheet or prepare was still in flight.
      // `begin` checks the phase after each await and unwinds itself.
      setPhaseBoth('idle');
      onCancel();
      return;
    }
    void finish();
  }, [finish, onCancel, readPhase, setPhaseBoth]);

  // Unmounting mid-hold must not leave the mic open or the session in
  // record mode for whatever screen comes next.
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      clearTimer();
      if (readPhase() === 'recording') {
        // Synchronous try/catch, not .catch(). useAudioRecorder's own cleanup
        // registers before this one and React unwinds in registration order, so
        // the shared object is already released by the time we get here and
        // stop() throws out of the JSI host function before a promise exists —
        // a trailing .catch() never sees it and the throw breaks unmount.
        // release() stops the recorder anyway; this is belt and braces.
        try {
          // The .catch still earns its place for the path where the object is
          // live and stop() rejects asynchronously instead.
          void recorder.stop().catch(() => {});
        } catch {
          // Already released. Nothing to stop.
        }
        void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      }
    };
  }, [clearTimer, readPhase, recorder]);

  /**
   * How held the control is: 0 idle, 1 armed or recording. Drives the ring and
   * the core through one value so the button reads as a single object being
   * pressed rather than three properties changing at once.
   */
  const hold = useRef(new Animated.Value(0)).current;
  const held = phase === 'arming' || phase === 'recording';
  useEffect(() => {
    Animated.timing(hold, {
      toValue: held ? 1 : 0,
      duration: motion.state,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [held, hold]);

  /**
   * Setting it down. On release the column loses its weight and fades over one
   * state duration — the finish path is async, so `stopping` is on screen long
   * enough to see. It is deliberately not a dismissal: the stack sinks two
   * points, the way a hand lets go of something rather than throwing it.
   */
  const settle = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (phase === 'stopping') {
      Animated.timing(settle, {
        toValue: 0,
        duration: motion.state,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (phase === 'idle') {
      // Nothing is drawn at idle, so this is invisible — it just re-arms the
      // value for the next take. Stop first: a hold started before the previous
      // settle finished would otherwise inherit an animation still running to
      // zero, and the new column would fade out as it was being built.
      settle.stopAnimation();
      settle.setValue(1);
    }
  }, [phase, settle]);

  /**
   * How much of the sixty seconds is gone, 0–1, pushed straight onto the ground
   * line. Set rather than animated: `elapsedMs` already ticks at the metering
   * cadence, which is smoother than any duration worth animating over.
   */
  const capacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    capacity.setValue(Math.min(1, elapsedMs / MAX_MS));
  }, [capacity, elapsedMs]);

  if (permission === 'denied') {
    return (
      <View style={styles.root}>
        <View style={styles.denied}>
          <Text style={styles.deniedTitle}>The microphone is off.</Text>
          <Text style={styles.deniedBody}>
            Cairn leaves voices in places. Without the mic there is nothing to leave. Turn
            it on in Settings — Privacy — Microphone, then come back here.
          </Text>
          <Pressable
            style={styles.deniedAction}
            accessibilityRole="button"
            accessibilityLabel="Not now"
            onPress={() => {
              // AC6 wants a clean return, not a dead end. Clear the panel here
              // rather than only telling the caller, so the control is back in
              // its idle state whether or not anyone wired onDismiss. Holding
              // again re-asks; iOS answers "denied" without a dialog and the
              // explanation comes straight back, which is the honest answer.
              setPermission('unknown');
              onDismiss?.();
            }}
          >
            {/* Sentence case in source. `type.mono` uppercases — hand-shouting
                it here is how the letterspacing ends up applied twice. */}
            <Text style={styles.deniedActionLabel}>Not now</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const recording = phase === 'recording';
  const remainingMs = Math.max(0, MAX_MS - elapsedMs);
  const showCountdown = recording && remainingMs <= COUNTDOWN_FROM_MS;
  const tint = stoneColor(elapsedMs);

  // Sentence case: `type.mono` uppercases. Four states, four different words —
  // the state is never carried by colour alone.
  const label = showCountdown
    ? `${Math.ceil(remainingMs / 1000)}s left`
    : recording
      ? `${(elapsedMs / 1000).toFixed(1)}s`
      : phase === 'arming'
        ? 'One moment'
        : phase === 'stopping'
          ? 'Setting it down'
          : 'Hold to speak';

  return (
    <View style={styles.root}>
      <View style={styles.wave}>
        {/* Newest stone sits at the bottom of the DOM order and the top of the
            pile, so column-reverse does the stacking without index maths. */}
        <Animated.View
          style={[
            styles.stack,
            {
              opacity: settle,
              transform: [
                { translateY: settle.interpolate({ inputRange: [0, 1], outputRange: [2, 0] }) },
              ],
            },
          ]}
        >
          {stones.map((stone) => (
            // One colour for the whole column. The old fade on the oldest
            // stones was telling you they were about to scroll away, and
            // nothing scrolls away any more — they merge in place.
            <FallingStone
              key={stone.seq}
              w={stone.w}
              dx={stone.dx}
              rot={stone.rot}
              tint={tint}
            />
          ))}
        </Animated.View>

        {/* Ground. The hairline is where the cairn sits; the fill inside it is
            the sixty seconds going. Scaled about its left edge with a matching
            translate, so it grows on the native driver and never lays out. */}
        <View style={styles.ground}>
          <Animated.View
            style={[
              styles.groundFill,
              {
                backgroundColor: groundColor(elapsedMs),
                transform: [
                  {
                    translateX: capacity.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-GROUND_W / 2, 0],
                    }),
                  },
                  { scaleX: capacity },
                ],
              },
            ]}
          />
        </View>
      </View>

      <Text style={styles.meta}>{label}</Text>

      <Pressable
        onPressIn={() => void begin()}
        onPressOut={release}
        accessibilityRole="button"
        accessibilityLabel="Hold to speak"
        accessibilityHint="Press and hold to record a voice stone. Release to keep it."
        accessibilityState={{ busy: held }}
        style={[styles.button, held && styles.buttonHeld]}
      >
        {/*
          The core. It contracts under the thumb and goes amber the moment the
          mic is actually open — the one place in this control amber is spent,
          and it is spent on "live", not on chrome. Shape carries the same
          message as the colour: armed is smaller than idle, live is smaller
          still and hard-edged, so the state survives a sunlit screen.
        */}
        <Animated.View
          style={[
            styles.core,
            recording && styles.coreLive,
            {
              transform: [
                { scale: hold.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] }) },
              ],
            },
          ]}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', paddingVertical: s.unit * 3, gap: s.unit * 2 },

  wave: { height: WAVE_H, justifyContent: 'flex-end', alignItems: 'center' },
  stack: { flexDirection: 'column-reverse', alignItems: 'center', gap: STONE_GAP },
  stone: {
    height: STONE_H,
    borderRadius: s.r.stone,
    backgroundColor: colors.accent,
  },

  ground: {
    marginTop: STONE_GAP,
    width: GROUND_W,
    height: s.hairline,
    backgroundColor: colors.t12,
  },
  groundFill: { position: 'absolute', left: 0, top: 0, width: GROUND_W, height: s.hairline },

  meta: { ...type.mono, color: colors.textFaint },

  button: {
    width: BUTTON_D,
    height: BUTTON_D,
    borderRadius: BUTTON_D / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: s.hairline,
    borderColor: colors.t20,
    backgroundColor: colors.surface,
  },
  // Contour-on-base, per the rule that primary buttons are never amber fills.
  // Amber in here is a signal, not chrome — it is spent on the live core and
  // the stones, and a button that borrows it spends the proximity payoff.
  buttonHeld: { borderColor: colors.contour, backgroundColor: colors.t12 },
  /** Idle and armed: a round pebble at the metadata rung. */
  core: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.t40 },
  /**
   * Live: the pebble becomes a stone. Same 2pt radius as every stone in the
   * column above it, amber because the mic is open. Colour and shape both
   * change, so the state is not carried by colour alone.
   */
  coreLive: { borderRadius: s.r.stone, backgroundColor: colors.accent },

  denied: { paddingHorizontal: s.pad, gap: s.unit * 2, alignItems: 'flex-start' },
  deniedTitle: { ...type.body, color: colors.text },
  deniedBody: { ...type.small, color: colors.textMuted, maxWidth: s.measure * 5 },
  deniedAction: {
    minHeight: s.tap,
    minWidth: s.tap * 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: s.unit * 2,
    borderRadius: s.r.chip,
    borderWidth: s.hairline,
    borderColor: colors.contour,
  },
  deniedActionLabel: { ...type.mono, color: colors.text },
});

export default HoldToRecord;
