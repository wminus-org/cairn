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
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { File } from 'expo-file-system';

import { colors, palette, s, type } from '../theme';

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
 * Fixed jitter table, in points — deterministic, so a stone never twitches on
 * re-render. It offsets the stone sideways and never scales it: width is the
 * only thing carrying amplitude, and jitter in the width is exactly how a
 * centred column starts reading as the mirrored audiogram the ticket rejects.
 */
const JITTER = [0, 2, -1, 2, -2, 1, -2, 1];

function stoneWidth(level: number): number {
  const w = STONE_W_MIN + level * (STONE_W_MAX - STONE_W_MIN);
  return Math.round(w < STONE_W_MIN ? STONE_W_MIN : w > STONE_W_MAX ? STONE_W_MAX : w);
}

type Stone = { seq: number; w: number; dx: number };

/**
 * At the cap, fold the stack in half: each pair becomes one stone at their mean
 * width. Keys survive because the merged stone inherits the older seq, and
 * every seq in the column is still distinct.
 */
function mergePairs(stones: Stone[]): Stone[] {
  const merged: Stone[] = [];
  for (let i = 0; i < stones.length; i += 2) {
    const a = stones[i];
    const b = stones[i + 1] ?? a;
    merged.push({ seq: a.seq, w: Math.round((a.w + b.w) / 2), dx: a.dx });
  }
  return merged;
}

/** The column tints toward terracotta over the last five seconds. */
const TINT_FROM_MS = 55_000;

/** Channels read off the palette rather than a sixth hex literal in this file. */
function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const AMBER = channels(palette.amber);
const TERRACOTTA = channels(palette.terracotta);

/**
 * The same information as the countdown, in the place the eye already is. It
 * reads as the take running out rather than as an error — which is why it is a
 * gradient into the stones and not a line of red copy.
 */
function stoneColor(elapsedMs: number): string {
  const raw = (elapsedMs - TINT_FROM_MS) / (MAX_MS - TINT_FROM_MS);
  const k = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  if (k === 0) return palette.amber;
  const [r, g, b] = AMBER.map((c, i) => Math.round(c + (TERRACOTTA[i] - c) * k));
  return `rgb(${r}, ${g}, ${b})`;
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
            <Text style={styles.deniedActionLabel}>NOT NOW</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const recording = phase === 'recording';
  const remainingMs = Math.max(0, MAX_MS - elapsedMs);
  const showCountdown = recording && remainingMs <= COUNTDOWN_FROM_MS;
  const tint = stoneColor(elapsedMs);

  return (
    <View style={styles.root}>
      <View style={styles.wave}>
        {/* Newest stone sits at the bottom of the DOM order and the top of the
            pile, so column-reverse does the stacking without index maths. */}
        <View style={styles.stack}>
          {stones.map((stone) => (
            <View
              key={stone.seq}
              style={[
                styles.stone,
                {
                  width: stone.w,
                  // Jitter as an offset on a fixed-width stone: the column edge
                  // is what wanders, not the stone's weight.
                  transform: [{ translateX: stone.dx }],
                  // One colour for the whole column. The old fade on the oldest
                  // stones was telling you they were about to scroll away, and
                  // nothing scrolls away any more — they merge in place.
                  backgroundColor: tint,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.baseline} />
      </View>

      <Text style={styles.meta}>
        {showCountdown
          ? `${Math.ceil(remainingMs / 1000)}S LEFT`
          : recording
            ? `${(elapsedMs / 1000).toFixed(1)}S`
            : phase === 'arming'
              ? 'ONE MOMENT'
              : 'HOLD TO SPEAK'}
      </Text>

      <Pressable
        onPressIn={() => void begin()}
        onPressOut={release}
        style={({ pressed }) => [
          styles.button,
          (pressed || recording) && styles.buttonHeld,
        ]}
      >
        <View style={[styles.dot, recording && styles.dotLive]} />
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
  baseline: {
    marginTop: STONE_GAP,
    width: 120,
    height: 1,
    backgroundColor: colors.t12,
  },

  meta: { ...type.mono, color: colors.textFaint },

  button: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.t20,
    backgroundColor: colors.surface,
  },
  // Contour-on-base, per the rule that primary buttons are never amber fills.
  // Amber in here is a signal, not chrome — it is spent on the live dot and the
  // stones, and a button that borrows it spends the proximity payoff.
  buttonHeld: { borderColor: colors.contour, backgroundColor: colors.t12 },
  dot: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.t40 },
  dotLive: { backgroundColor: colors.accent },

  denied: { paddingHorizontal: s.pad, gap: s.unit * 2, alignItems: 'flex-start' },
  deniedTitle: { ...type.body, color: colors.text },
  deniedBody: { ...type.small, color: colors.textMuted, maxWidth: 320 },
  deniedAction: { paddingVertical: s.unit, paddingHorizontal: s.unit * 2, borderRadius: s.r.chip, backgroundColor: colors.surface },
  deniedActionLabel: { ...type.mono, color: colors.text },
});

export default HoldToRecord;
