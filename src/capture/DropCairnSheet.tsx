/**
 * Drop a cairn, then stack stones on it. Two steps, deliberately separate.
 *
 * CRN-009 plants the cairn; CRN-011 puts the first stone on it. This sheet used
 * to fuse them into one gesture, which read as tidy and was wrong twice over: a
 * cairn with zero stones is a valid row that the acceptance test has to be able
 * to SEE on the map before anything is recorded, and fusing them meant a failed
 * stone could take the cairn down with it. So: Drop creates the cairn alone and
 * tells the map immediately. Everything after that stacks stones onto an id
 * that already exists, and therefore cannot plant a second cairn no matter how
 * many times it is retried.
 *
 * ORDERING — mint, upload, then insert. The only order 0004_proximity_gate.sql
 * actually serves. `stack_stone` takes `p_stone_id` (client-minted), REBUILDS
 * `{cairn_id}/{stone_id}.m4a` from ids it controls, and raises
 * 'audio path must be %' if the path handed to it is not character-for-character
 * the key it derived. So the id has to exist before the upload — there is no
 * insert-then-write-the-path-back step any more, because that write-back was
 * the confused deputy the migration removes.
 *
 * The stone id is minted HERE, once per recording, and held on the local stone.
 * That is what lets a retry re-upload the same file to the same key instead of
 * stranding another orphan object under a fresh one — `uploadToBucket` upserts,
 * so overwriting a half-written object is the intended path. It is also why
 * this composes `uploadStoneAudio` + `stackStone` rather than calling
 * `stackVoiceStone`, which mints its own id internally and so cannot give a
 * retry a stable key.
 *
 * Every RPC and every upload goes through src/lib/cairnApi.ts. Position comes
 * from the caller, which got it from the single watch in usePosition.ts — this
 * sheet never starts a second one.
 *
 * Playback is out of scope. Private buckets, no signer yet. Uploading and
 * appearing on the map is the whole job.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import HoldToRecord, { type RecordingResult } from './HoldToRecord';
import {
  createCairn,
  requestTranscription,
  isCairnApiError,
  newStoneId,
  stackStone,
  uploadStoneAudio,
} from '../lib/cairnApi';
import type { PositionCoords } from '../lib/usePosition';
import { colors, s, type } from '../theme';

/** CRN-009: single line, and blank is fine. */
const TITLE_MAX = 60;

/**
 * Where a cairn goes. `spaceId: null` is a PERSONAL cairn — public, gated by
 * proximity alone — and it is the default.
 *
 * This arrives as a prop rather than being picked inside the sheet on purpose:
 * the active Space is app state, not sheet state. A selector owning its own
 * value would silently reset to Personal every time the sheet closed, which is
 * exactly the failure where someone leaves three stones in a Space and the
 * fourth lands in public. The picker and the store behind it belong above this
 * component; this file renders the destination and threads the id through.
 */
export interface DropDestination {
  spaceId: string | null;
  /** Rendered as-is and uppercased by the mono style. `Personal` when spaceId is null. */
  label: string;
}

const PERSONAL: DropDestination = { spaceId: null, label: 'Personal' };

export interface DropCairnSheetProps {
  visible: boolean;
  /** Where the cairn lands. The drop point IS the caller's position. */
  coords: PositionCoords;
  /** Defaults to Personal. Feed this from the app-level active-Space store. */
  destination?: DropDestination;
  onClose: () => void;
  /**
   * Fired the instant the cairn ROW EXISTS — before any recording — and again
   * each time a stone is confirmed. Both mean the same thing: the server's
   * numbers changed, go and re-read them. The caller is free to close us on the
   * first one; the capture step below stays up on its own state.
   */
  onDropped: (cairnId: string) => void;
}

/**
 * A stone in this sheet's local thread.
 *
 * `id` is minted before the upload and never changes, because it IS the storage
 * key. `levels` is the recorder's sample array, carried in memory so the stone
 * just recorded draws its real shape rather than a synthesised one — `stones`
 * has no column for it, so it lives exactly as long as this thread does.
 */
interface LocalStone {
  id: string;
  uri: string;
  durationMs: number;
  levels: number[];
  status: 'pending' | 'confirmed' | 'failed';
  failure: string | null;
}

/** The cairn, once it exists. Non-null means the drop half is done. */
interface DropSession {
  cairnId: string;
  title: string | null;
}

/** Five decimal places is ~1m. Below that we would be rendering GPS noise. */
function formatCoords(coords: PositionCoords): string {
  const lat = `${Math.abs(coords.latitude).toFixed(5)} ${coords.latitude < 0 ? 'S' : 'N'}`;
  const lng = `${Math.abs(coords.longitude).toFixed(5)} ${coords.longitude < 0 ? 'W' : 'E'}`;
  return `${lat}   ${lng}`;
}

/**
 * A sentence, not a Postgres string. `too-far` is the one a walker can actually
 * fix, so it gets an instruction rather than an apology.
 */
function describeFailure(err: unknown): string {
  // Always dump the real thing to Metro. A swallowed error costs more time on
  // a build day than an ugly log line ever will.
  console.error('[cairn] drop failed:', err);

  if (isCairnApiError(err)) {
    switch (err.kind) {
      case 'too-far':
        return 'You moved before that landed. Walk back to the cairn and try again.';
      case 'position-required':
        return 'Lost your position. Wait for a fix and try again.';
      case 'unauthenticated':
        return 'Signed out. Reopen the app and try again.';
      default:
        // Surface the underlying message rather than hiding it. Every server
        // piece has been verified working in isolation, so whatever lands here
        // is the actual bug and we need to be able to read it off the screen.
        return `That did not save.\n\n[${err.rpc}${err.code ? ` ${err.code}` : ''}] ${err.message}`;
    }
  }
  const detail =
    err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
  return `That did not save.\n\n${detail}`;
}

// --- Waveform ---------------------------------------------------------------

const WAVE_BARS = 28;
const WAVE_MIN_H = 3;
const WAVE_MAX_H = 20;

/**
 * Downsample to a fixed bar count by PEAK, not mean. Speech averaged over a
 * bucket is a flat line — the peaks are the syllables, and the syllables are
 * the only thing that makes one recording look unlike another.
 */
function waveShape(levels: number[]): number[] {
  if (levels.length === 0) return [];
  const bucket = levels.length / WAVE_BARS;
  const out: number[] = [];
  for (let i = 0; i < WAVE_BARS; i += 1) {
    const start = Math.floor(i * bucket);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucket));
    let peak = 0;
    for (let j = start; j < end && j < levels.length; j += 1) {
      if (levels[j] > peak) peak = levels[j];
    }
    out.push(WAVE_MIN_H + peak * (WAVE_MAX_H - WAVE_MIN_H));
  }
  return out;
}

/**
 * One tint per state, and the tint IS the status indicator — there is no
 * spinner anywhere in this file. A stone still uploading is its own skeleton:
 * its real shape at 20%, which is the loading treatment the system asks for
 * ("a skeleton in the shape of the thing, or nothing").
 */
function tintFor(status: LocalStone['status']): string {
  if (status === 'failed') return colors.unresolved;
  if (status === 'pending') return colors.t20;
  return colors.t60;
}

function Waveform({ levels, status }: { levels: number[]; status: LocalStone['status'] }) {
  const bars = waveShape(levels);
  const tint = tintFor(status);

  // A take with no samples above the floor has no peaks to draw. A bare
  // baseline reads as "there is audio here and it is quiet"; an empty row reads
  // as a rendering bug.
  if (bars.length === 0) {
    return <View style={[styles.waveEmpty, { backgroundColor: tint }]} />;
  }

  return (
    <View style={styles.wave}>
      {bars.map((h, i) => (
        <View key={i} style={[styles.waveBar, { height: h, backgroundColor: tint }]} />
      ))}
    </View>
  );
}

// --- Sheet ------------------------------------------------------------------

export function DropCairnSheet({
  visible,
  coords,
  destination = PERSONAL,
  onClose,
  onDropped,
}: DropCairnSheetProps) {
  const [title, setTitle] = useState('');
  const [session, setSession] = useState<DropSession | null>(null);
  const [stones, setStones] = useState<LocalStone[]>([]);
  const [dropping, setDropping] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  /**
   * Live position, read at send time rather than closed over. The watch keeps
   * ticking while an upload runs and `stack_stone` re-derives distance from
   * whatever it is sent, so it has to be where the walker IS, not where they
   * were when the callback was built. Through a ref so the recorder's props
   * keep a stable identity across GPS ticks — a changing `onComplete` mid-hold
   * is how a finished recording ends up calling a stale closure.
   */
  const coordsRef = useRef(coords);
  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);

  /** The sheet can be dismissed while an upload is in flight; don't set state after. */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /**
   * Single-flight on the drop, synchronously. `dropping` state would do it, but
   * state lands a render later and two taps inside one tick is exactly the
   * gesture that plants two cairns a metre apart.
   */
  const dropInFlight = useRef(false);

  // Reopening is a fresh drop. Carrying a previous title, a stale error or a
  // finished thread over is how you accidentally re-title someone else's cairn.
  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setSession(null);
    setStones([]);
    setDropping(false);
    setDropError(null);
    dropInFlight.current = false;
  }, [visible]);

  const patchStone = useCallback((stoneId: string, patch: Partial<LocalStone>) => {
    setStones((prev) => prev.map((st) => (st.id === stoneId ? { ...st, ...patch } : st)));
  }, []);

  /**
   * The drop. One insert and nothing else, which is what makes it safe to press
   * again after a failure: `createCairn` either planted a row or it did not,
   * and there is no half state to reconcile.
   */
  const drop = useCallback(async () => {
    if (dropInFlight.current || session) return;
    dropInFlight.current = true;
    setDropping(true);
    setDropError(null);

    // Snapshot the position at press time. A cairn should land where the user
    // was standing when they decided to leave something, not where they had
    // wandered to by the time the insert returned.
    const at = { latitude: coordsRef.current.latitude, longitude: coordsRef.current.longitude };
    const trimmed = title.trim();
    const named = trimmed.length > 0 ? trimmed : null;

    try {
      const cairnId = await createCairn({
        latitude: at.latitude,
        longitude: at.longitude,
        title: named,
        spaceId: destination.spaceId,
      });
      if (!alive.current) return;
      setSession({ cairnId, title: named });
      // Tell the map now, with zero stones on it. This is the moment the ticket
      // asks to be observable: the cairn is on the map before anything is said.
      onDropped(cairnId);
    } catch (err) {
      if (!alive.current) return;
      setDropError(describeFailure(err));
    } finally {
      dropInFlight.current = false;
      if (alive.current) setDropping(false);
    }
  }, [destination.spaceId, onDropped, session, title]);

  /**
   * Upload, then insert. Both halves keyed by the stone id the caller already
   * minted, so a retry lands on the same object and the same row rather than
   * leaving a fresh orphan under a new key every time.
   */
  const sendStone = useCallback(
    async (cairnId: string, stone: LocalStone) => {
      try {
        const audioPath = await uploadStoneAudio(cairnId, stone.id, stone.uri);
        await stackStone({
          cairnId,
          kind: 'voice',
          position: coordsRef.current,
          stoneId: stone.id,
          audioPath,
        });
        if (!alive.current) return;
        // Reconciled. The server echoes the minted id back, which is exactly why
        // the optimistic stone and the real row are one stone and not two.
        patchStone(stone.id, { status: 'confirmed', failure: null });
        // The glyph on the map is sized by the server's stone_count. Now that
        // the row exists, ask for the new number.
        onDropped(cairnId);

        // Transcribe straight away rather than waiting for someone to open the
        // thread. Deliberately NOT awaited: the drop is already complete and
        // reconciled above, so a slow or failed Scribe call must not hold the
        // sheet open or turn a successful drop into a visible failure.
        // `requestTranscription` is written never to reject, and the thread
        // screen still fetches on open for anything that slipped through — so
        // this is a head start, not the only path.
        void requestTranscription(cairnId, stone.id, coordsRef.current);
      } catch (err) {
        if (!alive.current) return;
        patchStone(stone.id, { status: 'failed', failure: describeFailure(err) });
      }
    },
    [onDropped, patchStone],
  );

  /**
   * The optimistic insert. The stone is in the thread before the upload starts —
   * that is the whole of CRN-011 AC1, and it is why there is no blocking state
   * here to look at. In airplane mode it lands, sits at 20%, and goes
   * terracotta; it does not vanish.
   */
  const handleRecorded = useCallback(
    ({ uri, durationMs, levels }: RecordingResult) => {
      const cairnId = session?.cairnId;
      // Nothing to stack onto. Unreachable from the UI — the recorder only
      // mounts after the drop — but a stone with no cairn is worth refusing.
      if (!cairnId) return;

      const stone: LocalStone = {
        id: newStoneId(),
        uri,
        durationMs,
        levels,
        status: 'pending',
        failure: null,
      };
      setStones((prev) => [...prev, stone]);
      void sendStone(cairnId, stone);
    },
    [sendStone, session],
  );

  const retryStone = useCallback(
    (stone: LocalStone) => {
      const cairnId = session?.cairnId;
      if (!cairnId || stone.status === 'pending') return;
      patchStone(stone.id, { status: 'pending', failure: null });
      // Same id, same local file, same key. The upload upserts over whatever the
      // failed attempt left behind, and the cairn is untouched.
      void sendStone(cairnId, { ...stone, status: 'pending', failure: null });
    },
    [patchStone, sendStone, session],
  );

  /**
   * Closing cancels nothing. A pending upload keeps running and still reports
   * its stone to the map when it lands — the optimistic model only works if
   * walking away is free.
   */
  const dismiss = useCallback(() => {
    setSession(null);
    onClose();
  }, [onClose]);

  /**
   * Stay up on our own state once the cairn exists. `onDropped` is allowed to
   * close us — the map screen does exactly that, to refetch — and the capture
   * step has to outlive it or the second half of the flow is unreachable.
   */
  const open = visible || session !== null;
  const dropped = session !== null;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={dismiss}>
      <View style={styles.scrim}>
        <Pressable style={styles.scrimTap} onPress={dismiss} accessibilityLabel="Dismiss" />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.grabber} />

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.body}
            >
              <Text style={styles.heading}>
                {dropped ? (session?.title ?? 'Your cairn') : 'Leave something here'}
              </Text>
              <Text style={styles.meta}>
                {destination.label} — {formatCoords(coords)}
              </Text>

              {!dropped ? (
                <>
                  <TextInput
                    style={styles.titleField}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Title (optional)"
                    placeholderTextColor={colors.textFaint}
                    maxLength={TITLE_MAX}
                    returnKeyType="done"
                    autoCapitalize="sentences"
                    autoCorrect={false}
                    editable={!dropping}
                  />
                  {/* The title is the only thing visible from across the map, to
                      anyone who can see the cairn at all. The payload goes in the
                      stone, which is gated by standing here. */}
                  <Text style={styles.hint}>
                    Read from a distance by anyone. Name the place, not the thing you
                    came to say — “Radiator, 2nd floor”, not “valve leaking since
                    March”.
                  </Text>

                  {dropError ? <Text style={styles.failure}>{dropError}</Text> : null}

                  <Pressable
                    style={[styles.primary, dropping && styles.primaryOff]}
                    disabled={dropping}
                    onPress={() => void drop()}
                  >
                    {/* No spinner. The label carries the state. */}
                    <Text style={styles.primaryLabel}>{dropping ? 'Dropping…' : 'Drop'}</Text>
                  </Pressable>

                  <View style={styles.footer}>
                    <Pressable onPress={dismiss} hitSlop={s.unit}>
                      <Text style={styles.quiet}>Cancel</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.count}>
                    {stones.length === 0
                      ? 'Nothing on it yet'
                      : `${stones.length} ${stones.length === 1 ? 'stone' : 'stones'}`}
                  </Text>

                  {stones.length === 0 ? (
                    <Text style={styles.hint}>
                      The cairn is on the map already. Hold to speak, or walk away and
                      leave it empty — it will still be here.
                    </Text>
                  ) : null}

                  <View style={styles.thread}>
                    {stones.map((stone) => (
                      <View key={stone.id} style={styles.stone}>
                        <Waveform levels={stone.levels} status={stone.status} />
                        <View style={styles.stoneFoot}>
                          <Text style={styles.stoneMeta}>
                            {(stone.durationMs / 1000).toFixed(1)}s
                          </Text>
                          {stone.status === 'failed' ? (
                            <Pressable onPress={() => retryStone(stone)} hitSlop={s.unit}>
                              <Text style={styles.retry}>Retry</Text>
                            </Pressable>
                          ) : (
                            <Text style={styles.stoneMeta}>
                              {stone.status === 'pending' ? 'Sending' : 'On the cairn'}
                            </Text>
                          )}
                        </View>
                        {/* The stone stays visible when it fails. It exists on
                            this phone whether or not the server has heard of it. */}
                        {stone.failure ? (
                          <Text style={styles.stoneFailure}>{stone.failure}</Text>
                        ) : null}
                      </View>
                    ))}
                  </View>

                  <View style={styles.recorder}>
                    <HoldToRecord
                      onComplete={handleRecorded}
                      onCancel={() => {
                        // A fumbled tap. Stay put and say nothing — the recorder
                        // already returned itself to idle.
                      }}
                    />
                  </View>

                  <View style={styles.footer}>
                    <Pressable onPress={dismiss} hitSlop={s.unit}>
                      <Text style={styles.quiet}>Done</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default DropCairnSheet;

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 30, 23, 0.72)' },
  scrimTap: { flex: 1 },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: s.r.sheet,
    borderTopRightRadius: s.r.sheet,
    borderTopWidth: 1,
    borderColor: colors.hairline,
    paddingBottom: s.unit * 5,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 3,
    borderRadius: s.r.stone,
    marginTop: s.unit * 1.5,
    backgroundColor: colors.t20,
  },
  body: { padding: s.pad, paddingTop: s.unit * 3 },

  /**
   * Two type sizes on this screen, and they are `body` and `small`. Not
   * `display`: HoldToRecord's microphone-denied branch spends body + small and
   * cannot be edited from here, so a display heading would make three. Weight
   * separates the heading from the field it sits above, not size.
   */
  heading: { ...type.body, fontWeight: '500', color: colors.text },
  meta: { ...type.mono, color: colors.textFaint, marginBottom: s.unit * 3 },
  titleField: {
    ...type.body,
    color: colors.text,
    paddingVertical: s.unit * 1.5,
    borderBottomWidth: 1,
    borderColor: colors.hairline,
  },
  hint: {
    ...type.small,
    color: colors.textFaint,
    maxWidth: s.measure * 8,
    marginTop: s.unit,
  },
  count: { ...type.mono, color: colors.textFaint },

  // Contour on base with a hairline border. Amber marks what is unlocked, live
  // and in range — never chrome, and a button is chrome.
  primary: {
    marginTop: s.unit * 4,
    minHeight: s.tap,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: s.r.chip,
    borderWidth: 1,
    borderColor: colors.contour,
    backgroundColor: 'transparent',
  },
  // Dimmed, not hidden: the button has to stay where the thumb expects it.
  primaryOff: { opacity: 0.35 },
  primaryLabel: { ...type.mono, color: colors.contour },

  thread: { marginTop: s.unit * 3, gap: s.thread },
  stone: { gap: s.unit },
  wave: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: WAVE_MAX_H },
  waveBar: { width: 3, borderRadius: s.r.stone },
  waveEmpty: { height: WAVE_MIN_H, width: WAVE_BARS * 5, borderRadius: s.r.stone },
  stoneFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stoneMeta: { ...type.mono, color: colors.textFaint },
  // Terracotta earns its place on the stone itself — that is the unresolved
  // state CRN-011 specifies. The sentence underneath stays on the bone ladder,
  // because general error text is the one thing terracotta is never for.
  retry: { ...type.mono, color: colors.unresolved },
  stoneFailure: { ...type.small, color: colors.textMuted, maxWidth: s.measure * 8 },

  recorder: { marginTop: s.unit * 4 },
  footer: {
    marginTop: s.unit * 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quiet: { ...type.mono, color: colors.textFaint, paddingVertical: s.unit },
  failure: {
    ...type.small,
    color: colors.textMuted,
    maxWidth: s.measure * 8,
    marginTop: s.unit * 2,
  },
});
