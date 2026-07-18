/**
 * The stone thread — one cairn, opened.
 *
 * A cairn is a conversation held at a coordinate over time, and this is the
 * only surface where that reads. Newest stone at the top, oldest at the bottom:
 * stones stack upward, like the object.
 *
 * WHAT THIS SCREEN DOES NOT DO, and must never start doing: decide what you may
 * see. It sends a position to `cairn_detail` and renders the answer. `band` is
 * the server's word — computed in 0004_proximity_gate.sql from the cairn's own
 * stored row — and in the approach band the content genuinely is not in the
 * payload. There is no `if (distance < 30)` here and there cannot be one; a
 * judge with the network inspector open is the audience for that decision, not
 * the user.
 *
 * The blur over an approaching stone is therefore not a filter over data we
 * hold. It is a treatment over a waveform the client synthesised from the stone
 * id, which is all there is to draw.
 */
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  fetchCairnDetail,
  getStoneAudioUrl,
  isCairnApiError,
  requestTranscription,
  type CairnDetail,
  type CairnStone,
} from '../../src/lib/cairnApi';
import { usePosition, type PositionCoords } from '../../src/lib/usePosition';
import CairnGlyph from '../../src/thread/CairnGlyph';
import StoneRow, { type StoneDegrade, type StonePlayback } from '../../src/thread/StoneRow';
import { approachProgress, blurIntensity, formatDistance, metresToGo } from '../../src/thread/band';
import { colors, s, type } from '../../src/theme';

/**
 * Refetch throttle. `cairn_detail` is one round trip and the watch publishes
 * every ~5m of movement; refetching on every tick would hammer the gate for a
 * band that changes maybe three times on the whole walk.
 *
 * Three conditions, all of them needed:
 *  - moved far enough that the answer could plausibly differ,
 *  - and not sooner than MIN_INTERVAL_MS, so a burst of jittery fixes collapses
 *    into one call,
 *  - or IDLE_REFETCH_MS has passed while still locked, which is the case where
 *    the user is standing on the boundary and GPS drift alone decides. Standing
 *    still and never unlocking is the failure that looks like a broken app.
 */
const REFETCH_MOVE_M = 8;
const MIN_INTERVAL_MS = 4000;
const IDLE_REFETCH_MS = 12000;

/** How often the idle check runs. Not how often we fetch — see the throttle. */
const TICK_MS = 3000;

/**
 * Three durations in the whole app and one easing. This screen only ever uses
 * the long one: every animation here is distance-driven interpolation.
 */
const EASE_MS = 400;
const EASE = Easing.out(Easing.cubic);

/** Rough metres between two fixes. Only ever used to decide whether to refetch. */
function metresBetween(a: PositionCoords, b: PositionCoords): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

type Phase = 'waiting' | 'loading' | 'ready' | 'not-visible' | 'error';

export default function CairnThreadScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const cairnId = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const { coords, status } = usePosition();

  const [detail, setDetail] = useState<CairnDetail | null>(null);
  const [phase, setPhase] = useState<Phase>('waiting');
  /** Shown as a line under the header when a refetch fails but we still hold a thread. */
  const [errorText, setErrorText] = useState<string | null>(null);

  const inFlight = useRef(false);
  const lastFetch = useRef<{ at: PositionCoords; time: number } | null>(null);
  const coordsRef = useRef<PositionCoords | null>(null);
  const unlockedRef = useRef(false);

  /**
   * ONE player for the whole thread. Starting a second stone must stop the
   * first — a cairn is a conversation, not a chord — and a player per row would
   * hold a decoder open for every stone nobody pressed.
   */
  const player = useAudioPlayer();
  const playerStatus = useAudioPlayerStatus(player);
  const [playingStoneId, setPlayingStoneId] = useState<string | null>(null);
  /** Kept apart from `errorText` so a successful refetch does not wipe it. */
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);

  const load = useCallback(
    async (at: PositionCoords) => {
      if (!cairnId || inFlight.current) return;
      inFlight.current = true;
      // Stamped before the call, not after: two fixes arriving during one slow
      // round trip would otherwise both pass the throttle and both fire.
      lastFetch.current = { at, time: Date.now() };

      try {
        const next = await fetchCairnDetail(cairnId, at);
        if (!next) {
          // Not an error. The cairn does not exist, or it belongs to a Space
          // this account is not in, and the server refuses to say which —
          // telling them apart would confirm the cairn exists.
          setDetail(null);
          unlockedRef.current = false;
          setErrorText(null);
          setPhase('not-visible');
          return;
        }
        setDetail(next);
        unlockedRef.current = next.band === 'unlocked';
        setErrorText(null);
        setPhase('ready');
      } catch (err) {
        const failure = isCairnApiError(err) ? err : null;
        setErrorText(
          failure?.kind === 'unauthenticated'
            ? 'Signed out. Reopen the app to sign back in.'
            : 'Could not reach this cairn just now.',
        );
        // A failed refetch must not tear down a thread that is already on
        // screen — the walker keeps reading while the network sorts itself out.
        setPhase((prev) => (prev === 'ready' ? 'ready' : 'error'));
      } finally {
        inFlight.current = false;
      }
    },
    [cairnId],
  );

  /** The throttle, in one place, so the tick and the fix effect cannot disagree. */
  const maybeLoad = useCallback(() => {
    const at = coordsRef.current;
    if (!at) return;
    const last = lastFetch.current;
    if (!last) {
      void load(at);
      return;
    }
    const elapsed = Date.now() - last.time;
    if (elapsed < MIN_INTERVAL_MS) return;
    const moved = metresBetween(last.at, at) >= REFETCH_MOVE_M;
    const stale = !unlockedRef.current && elapsed >= IDLE_REFETCH_MS;
    if (moved || stale) void load(at);
  }, [load]);

  // First fix opens the thread; later fixes walk it toward unlocked.
  useEffect(() => {
    if (!coords) return;
    if (!lastFetch.current) setPhase('loading');
    maybeLoad();
  }, [coords, maybeLoad]);

  useEffect(() => {
    const timer = setInterval(maybeLoad, TICK_MS);
    return () => clearInterval(timer);
  }, [maybeLoad]);

  /**
   * The clip ended on its own. Nothing else reports that, and without it the row
   * keeps showing a stop glyph over a player that has already stopped.
   */
  useEffect(() => {
    if (playerStatus.didJustFinish) setPlayingStoneId(null);
  }, [playerStatus.didJustFinish]);

  /**
   * Playback. The client never signs — `audio_path` is a path in a private
   * bucket, and `getStoneAudioUrl` posts the position to the API route, which
   * re-runs the same gate under this user's token before it will sign. So a
   * press here is a second proximity check, not a formality: the 403 it can
   * come back with is the server disagreeing with what this screen is showing.
   */
  const onToggle = useCallback(
    async (stoneId: string) => {
      if (playingStoneId === stoneId) {
        player.pause();
        setPlayingStoneId(null);
        return;
      }

      const at = coordsRef.current;
      if (!at) return;

      setPlaybackError(null);
      try {
        const { url } = await getStoneAudioUrl(cairnId, stoneId, at);
        // Silence the outgoing stone before the next one loads, so two clips
        // cannot overlap across the swap.
        player.pause();
        player.replace({ uri: url });
        player.play();
        setPlayingStoneId(stoneId);
      } catch (err) {
        const failure = isCairnApiError(err) ? err : null;
        setPlayingStoneId(null);
        if (failure?.kind === 'too-far') {
          setPlaybackError('You have walked out of range. Come back to hear this.');
          // The header says "here" and the gate just said otherwise. Refetch so
          // the screen stops making a promise the server will not keep.
          void load(at);
        } else {
          setPlaybackError(
            failure?.kind === 'unauthenticated'
              ? 'Signed out. Reopen the app to sign back in.'
              : 'Could not open this recording.',
          );
        }
      }
    },
    [cairnId, load, player, playingStoneId],
  );

  /** 0–1 through the clip, for the amber fill on the row that is playing. */
  const clipProgress = useMemo(() => {
    if (!playerStatus.isLoaded || playerStatus.duration <= 0) return 0;
    return Math.min(1, Math.max(0, playerStatus.currentTime / playerStatus.duration));
  }, [playerStatus.isLoaded, playerStatus.currentTime, playerStatus.duration]);

  /** Asked-for already, so a refetch every few seconds does not re-ask. */
  const transcribed = useRef<Set<string>>(new Set());

  /**
   * Transcripts are DEMO.md's fallback for a loud room, and they are fetched
   * here rather than at upload because only a caller who is standing at the
   * cairn may ask — the route re-runs the gate exactly as the signer does.
   *
   * `requestTranscription` is written never to throw, so an un-awaited call is
   * safe. One attempt per stone per session: a null answer leaves the row
   * audio-only, which is a complete state, not a failure to retry.
   */
  useEffect(() => {
    if (!detail || detail.band !== 'unlocked') return;
    const at = coordsRef.current;
    if (!at) return;

    for (const stone of detail.stones) {
      if (stone.kind !== 'voice' || !stone.audio_path || stone.transcript) continue;
      if (transcribed.current.has(stone.id)) continue;
      transcribed.current.add(stone.id);

      void requestTranscription(cairnId, stone.id, at).then((transcript) => {
        if (!transcript) return;
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                stones: prev.stones.map((row) =>
                  row.id === stone.id ? { ...row, transcript } : row,
                ),
              }
            : prev,
        );
      });
    }
  }, [cairnId, detail]);

  /**
   * Newest first. The RPC already orders by `created_at desc`, and this sorts
   * anyway — cheap for eleven rows, and a thread that silently renders bottom-up
   * because an ordering changed upstream is the kind of thing nobody notices
   * until the three-month spread is on a projector.
   */
  const stones = useMemo<CairnStone[]>(() => {
    if (!detail) return [];
    return [...detail.stones].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [detail]);

  // --- The distance-driven ease ---------------------------------------------
  //
  // `t` arrives in steps, because the refetch throttle deliberately batches
  // position fixes into one round trip every few seconds. Rendering those steps
  // raw would make the approach band flick between two blurs, which reads as a
  // state machine; the design system's answer is 400ms ease-out on every
  // t-driven property, so GPS jitter reads as breathing.
  //
  // Two values driven together, and the split is the point:
  //  - `tVisual` runs on the native driver and only ever feeds `opacity`, so the
  //    eleven-stone thread eases without React re-rendering at all.
  //  - `tLayout` cannot (it drives a percentage width), so it stays on the JS
  //    driver and is the one thing that pays for the animation.
  const tLayout = useRef(new Animated.Value(0)).current;
  const tVisual = useRef(new Animated.Value(0)).current;

  /** The server's `t`, or null when there is no approach band to render. */
  const targetT = useMemo(() => {
    if (!detail || detail.band !== 'approaching') return null;
    return approachProgress(detail.distance_m, detail.radius_m);
  }, [detail]);

  useEffect(() => {
    if (targetT === null) return;
    const timing = { duration: EASE_MS, easing: EASE, isInteraction: false };
    Animated.parallel([
      Animated.timing(tLayout, { ...timing, toValue: targetT, useNativeDriver: false }),
      Animated.timing(tVisual, { ...timing, toValue: targetT, useNativeDriver: true }),
    ]).start();
  }, [targetT, tLayout, tVisual]);

  /**
   * Blur is an expo-blur *prop*, not a style, so it cannot ride the driver — it
   * has to come back through React. Quantising to steps of 5 caps a full 90 → 0
   * sweep at eighteen renders instead of ~24 per second, and at these radii a
   * five-point step in blur is not a step anybody can see.
   */
  const [blur, setBlur] = useState(90);
  useEffect(() => {
    const id = tLayout.addListener(({ value }) => {
      const next = Math.round(blurIntensity(value) / 5) * 5;
      setBlur((prev) => (prev === next ? prev : next));
    });
    return () => tLayout.removeListener(id);
  }, [tLayout]);

  /**
   * The synthesised stack fades in over 200 → 180m so crossing the outer edge is
   * a fade, not a pop — `stackOpacity`'s `clamp(t * 8.5, 0, 1)` expressed as an
   * interpolation, so the curve lives on the animated node instead of being
   * recomputed per frame.
   */
  const stackOpacity = useMemo(
    () =>
      tVisual.interpolate({
        inputRange: [0, 1 / 8.5, 1],
        outputRange: [0, 1, 1],
      }),
    [tVisual],
  );

  /** One curve for the whole list rather than one per row. */
  const degrade = useMemo<StoneDegrade | null>(
    () => (targetT === null ? null : { blur, opacity: stackOpacity }),
    [blur, stackOpacity, targetT],
  );

  /**
   * Arrival. The unlocked band is the payoff of the entire distance mechanic and
   * it should land as one — the thread settles up 8pt and resolves over 400ms
   * rather than appearing mid-scroll as though it had always been there. Fires
   * on the transition into `unlocked`, including a cold open while already
   * standing at the cairn, which is how the last demo cairn is opened.
   */
  const settle = useRef(new Animated.Value(0)).current;
  const lastBand = useRef<string | null>(null);
  useEffect(() => {
    const band = detail?.band ?? null;
    if (band === 'unlocked' && lastBand.current !== 'unlocked') {
      settle.setValue(0);
      Animated.timing(settle, {
        toValue: 1,
        duration: EASE_MS,
        easing: EASE,
        useNativeDriver: true,
      }).start();
    }
    lastBand.current = band;
  }, [detail?.band, settle]);

  const settleStyle = useMemo(
    () => ({
      opacity: settle,
      transform: [{ translateY: settle.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
    }),
    [settle],
  );

  const goBack = useCallback(() => {
    // A deep link or a cold start can land here with nothing behind it.
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const unlocked = detail?.band === 'unlocked';

  /**
   * Null means no play control at all. Two guards, and neither is a distance
   * check: the band is the server's word, and `audio_path` is absent from the
   * payload entirely below 'unlocked' — the control is missing for the same
   * reason the media is.
   */
  const playbackFor = useCallback(
    (stone: CairnStone): StonePlayback | null => {
      if (!unlocked || stone.kind !== 'voice' || !stone.audio_path) return null;
      const isPlaying = playingStoneId === stone.id;
      return {
        isPlaying,
        progress: isPlaying ? clipProgress : 0,
        onToggle: () => void onToggle(stone.id),
      };
    },
    [clipProgress, onToggle, playingStoneId, unlocked],
  );

  /**
   * Only knowable once unlocked — `pins` does not exist in the stub band. A
   * cairn that holds an open question says so at the top, in terracotta *and*
   * in words, because the flag has to survive a projector and a colourblind
   * viewer alike.
   */
  const hasUnresolved = useMemo(
    () => stones.some((stone) => (stone.pins ?? []).some((pin) => pin.unresolved)),
    [stones],
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        {/* Not a chrome button — no pill, no circle, no fill. Two hairlines: a
            45-degree tick and a rule running back the way you came. The design
            system allows exactly this and no icon set. */}
        <Pressable
          onPress={goBack}
          hitSlop={s.unit * 2}
          style={styles.backTarget}
          accessibilityRole="button"
          accessibilityLabel="Back to the map"
        >
          <View style={styles.backArrow}>
            <View style={styles.backTick} />
            <View style={styles.backRule} />
          </View>
        </Pressable>

        <Text style={styles.title} numberOfLines={2}>
          {detail?.title || (phase === 'not-visible' ? 'Nothing here' : 'Cairn')}
        </Text>

        {detail ? (
          <View style={styles.metaRow}>
            <Text style={styles.meta}>
              {`${detail.stone_count} ${detail.stone_count === 1 ? 'stone' : 'stones'}`}
            </Text>
            <Text style={styles.meta}>·</Text>
            {/* HERE is the payoff of the whole distance mechanic and the only
                amber on this screen. It keys off the server's band, never off
                comparing distance_m to radius_m here — the word and the content
                it promises must not be able to disagree. */}
            {unlocked ? (
              <Text style={styles.here}>here</Text>
            ) : (
              <Text style={styles.meta}>{formatDistance(detail.distance_m)}</Text>
            )}
            {hasUnresolved ? (
              <>
                <Text style={styles.meta}>·</Text>
                <Text style={styles.unresolved}>unresolved</Text>
              </>
            ) : null}
          </View>
        ) : null}

        {/* Walking is the loading bar, rendered as one hairline. Contour, never
            amber: this is the approach, not the arrival. It disappears entirely
            in the other two bands rather than sitting empty or full. */}
        {targetT !== null ? (
          <View
            style={styles.approachTrack}
            accessibilityRole="progressbar"
            accessibilityLabel="Distance to unlock"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(targetT * 100) }}
          >
            <Animated.View
              style={[
                styles.approachFill,
                { width: tLayout.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
              ]}
            />
          </View>
        ) : null}

        {errorText || playbackError ? (
          <Text style={styles.copy}>{errorText ?? playbackError}</Text>
        ) : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ThreadBody
          phase={phase}
          status={status}
          detail={detail}
          stones={stones}
          degrade={degrade}
          unlocked={!!unlocked}
          settleStyle={settleStyle}
          playbackFor={playbackFor}
          onRetry={() => {
            const at = coordsRef.current;
            if (at) void load(at);
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function ThreadBody({
  phase,
  status,
  detail,
  stones,
  degrade,
  unlocked,
  settleStyle,
  playbackFor,
  onRetry,
}: {
  phase: Phase;
  status: string;
  detail: CairnDetail | null;
  stones: CairnStone[];
  degrade: StoneDegrade | null;
  unlocked: boolean;
  settleStyle: { opacity: Animated.Value; transform: { translateY: Animated.AnimatedInterpolation<number> }[] };
  playbackFor: (stone: CairnStone) => StonePlayback | null;
  onRetry: () => void;
}) {
  if (phase === 'waiting' || (phase === 'loading' && !detail)) {
    if (status === 'denied') {
      return <Text style={styles.copy}>Location is off. Cairn only works where you are standing.</Text>;
    }
    // No spinner. A skeleton in the shape of the thing that is loading — which
    // here means the spine too, so the thread does not jump sideways by 24pt
    // the moment the real stones arrive.
    return (
      <View style={styles.skeletonThread}>
        {[0, 1, 2].map((row) => (
          <View key={row} style={styles.skeletonRow}>
            <View style={styles.skeletonRail}>
              <View
                style={[styles.skeletonSpine, { top: row === 0 ? 9 : 0, bottom: row === 2 ? 0 : -s.thread }]}
              />
            </View>
            <View style={styles.skeletonStone}>
              <View style={[styles.skeletonLine, styles.skeletonMeta]} />
              <View style={styles.skeletonLine} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (phase === 'not-visible') {
    // Deliberately says nothing about whether the cairn exists. A Space cairn is
    // invisible to non-members — not locked, not hinted at, absent.
    return <Text style={styles.copy}>There is nothing here to open.</Text>;
  }

  if (phase === 'error' || !detail) {
    return (
      <View style={styles.errorBlock}>
        <Text style={styles.copy}>
          Could not reach this cairn. Check your connection and try again.
        </Text>
        <Pressable onPress={onRetry} style={styles.retry} accessibilityRole="button">
          <Text style={styles.retryLabel}>try again</Text>
        </Pressable>
      </View>
    );
  }

  if (detail.band === 'far') {
    // No stones, no stubs, no shapes, no skeletons. The payload contains a count
    // and a distance, and that is all this state is allowed to show — so it
    // shows the cairn as an object: a sealed stack whose height *is* the count,
    // sitting on a hairline of ground, and a number of metres to walk.
    //
    // `radius_m` is read off the response, never assumed to be 30. A meeting-room
    // cairn seeded with an 80m radius must say "walk 120 m closer" and then open
    // when it says it will.
    const toGo = metresToGo(detail.distance_m, detail.radius_m);
    return (
      <View style={styles.sealed}>
        {detail.stone_count > 0 ? (
          <View style={styles.sealedGlyph}>
            <CairnGlyph stoneCount={detail.stone_count} scale={3} color={colors.t60} />
            <View style={styles.ground} />
          </View>
        ) : null}

        <Text style={styles.copy}>
          {detail.stone_count === 0
            ? 'Nothing has been stacked here yet.'
            : 'Sealed until you are standing at it.'}
        </Text>
        <Text style={styles.meta}>{`walk ${toGo} m closer`}</Text>
      </View>
    );
  }

  if (detail.stone_count === 0) {
    return <Text style={styles.copy}>Nothing has been stacked here yet.</Text>;
  }

  const rows = stones.map((stone, i) => (
    <StoneRow
      key={stone.id}
      stone={stone}
      unlocked={unlocked}
      degrade={degrade}
      playback={playbackFor(stone)}
      isNewest={i === 0}
      isOldest={i === stones.length - 1}
    />
  ));

  if (detail.band === 'approaching') {
    // Bylines stay sharp. That is deliberate and it is the honest reading of the
    // stub payload: the server sent who and when, so the walker gets to see four
    // people across three months and nothing they said. The blur is only over
    // the parts that do not exist yet.
    return (
      <View style={styles.thread}>
        <Text style={styles.copy}>
          {`Close, but not there. Come within ${detail.radius_m} m and this opens.`}
        </Text>
        {rows}
      </View>
    );
  }

  return <Animated.View style={[styles.thread, settleStyle]}>{rows}</Animated.View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: s.gutter,
    paddingTop: s.unit,
    paddingBottom: s.unit * 2,
    gap: s.unit,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  backTarget: {
    // Wider than tall so the whole arrow is inside the target, and pulled left
    // so the tick optically aligns with the title's left edge rather than the
    // tap box's.
    width: s.tap + s.unit * 2,
    height: s.tap,
    marginLeft: -s.unit,
    justifyContent: 'center',
  },
  backArrow: { flexDirection: 'row', alignItems: 'center' },
  backTick: {
    width: 9,
    height: 9,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.t60,
    transform: [{ rotate: '45deg' }],
  },
  // The rotated tick's visual point sits ~1pt past its layout box, so the rule
  // starts there rather than at the box edge.
  backRule: { width: 16, height: 1, marginLeft: 1, backgroundColor: colors.t60 },

  title: { ...type.display, color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: s.unit },
  meta: { ...type.mono, color: colors.textFaint },
  here: { ...type.mono, color: colors.accent },
  unresolved: { ...type.mono, color: colors.unresolved },

  approachTrack: {
    height: 1,
    marginTop: s.unit,
    backgroundColor: colors.hairline,
    overflow: 'hidden',
  },
  approachFill: { height: 1, backgroundColor: colors.t60 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: s.gutter, paddingVertical: s.unit * 3, paddingBottom: s.unit * 6 },
  thread: { gap: s.thread },

  sealed: { gap: s.unit * 2, alignItems: 'flex-start' },
  sealedGlyph: { alignSelf: 'stretch', gap: s.unit, marginBottom: s.unit * 2 },
  // The ground the stack sits on. One hairline; that is the whole device.
  ground: { height: 1, backgroundColor: colors.hairline },

  errorBlock: { gap: s.unit * 2, alignItems: 'flex-start' },
  copy: { ...type.body, color: colors.t60 },
  retry: {
    paddingHorizontal: s.pad,
    // 44pt tap target, not 44pt of padding.
    minHeight: s.tap,
    justifyContent: 'center',
    borderRadius: s.r.chip,
    // Primary buttons are contour-on-base with a 1pt border. Never an amber
    // fill — amber is a proximity signal, not chrome.
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  retryLabel: { ...type.body, color: colors.text },

  skeletonThread: { gap: s.thread },
  skeletonRow: { flexDirection: 'row' },
  skeletonRail: { width: 12 },
  skeletonSpine: { position: 'absolute', left: 5.5, width: 1, backgroundColor: colors.hairline },
  skeletonStone: { flex: 1, marginLeft: 12, gap: s.unit },
  skeletonLine: { height: 10, borderRadius: s.r.stone, backgroundColor: colors.t20 },
  skeletonMeta: { width: '40%' },
});
