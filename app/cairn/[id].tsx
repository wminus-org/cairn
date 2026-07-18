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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  fetchCairnDetail,
  isCairnApiError,
  type CairnDetail,
  type CairnStone,
} from '../../src/lib/cairnApi';
import { usePosition, type PositionCoords } from '../../src/lib/usePosition';
import StoneRow, { type StoneDegrade } from '../../src/thread/StoneRow';
import {
  approachProgress,
  blurIntensity,
  formatDistance,
  metresToGo,
  stackOpacity,
} from '../../src/thread/band';
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

  /** One curve for the whole list rather than one per row. */
  const degrade = useMemo<StoneDegrade | null>(() => {
    if (!detail || detail.band !== 'approaching') return null;
    const t = approachProgress(detail.distance_m, detail.radius_m);
    return { blur: blurIntensity(t), opacity: stackOpacity(t) };
  }, [detail]);

  const goBack = useCallback(() => {
    // A deep link or a cold start can land here with nothing behind it.
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const unlocked = detail?.band === 'unlocked';

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          hitSlop={s.unit * 2}
          style={styles.backTarget}
          accessibilityRole="button"
          accessibilityLabel="Back to the map"
        >
          {/* No icon set. A chevron is a 1pt line at 45 degrees. */}
          <View style={styles.chevron} />
        </Pressable>

        <Text style={styles.title} numberOfLines={2}>
          {detail?.title || (phase === 'not-visible' ? 'Nothing here' : 'Cairn')}
        </Text>

        {detail ? (
          <View style={styles.metaRow}>
            <Text style={styles.meta}>
              {`${detail.stone_count} ${detail.stone_count === 1 ? 'stone' : 'stones'} · `}
            </Text>
            {/* HERE is the payoff of the whole distance mechanic and the only
                amber on this screen. It keys off the server's band, never off
                comparing distance_m to radius_m here — the word and the content
                it promises must not be able to disagree. */}
            {unlocked ? (
              <Text style={styles.here}>here</Text>
            ) : (
              <Text style={styles.meta}>{formatDistance(detail.distance_m)}</Text>
            )}
          </View>
        ) : null}

        {errorText ? <Text style={styles.meta}>{errorText}</Text> : null}
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
  onRetry,
}: {
  phase: Phase;
  status: string;
  detail: CairnDetail | null;
  stones: CairnStone[];
  degrade: StoneDegrade | null;
  unlocked: boolean;
  onRetry: () => void;
}) {
  if (phase === 'waiting' || (phase === 'loading' && !detail)) {
    if (status === 'denied') {
      return <Text style={styles.copy}>Location is off. Cairn only works where you are standing.</Text>;
    }
    // No spinner. A skeleton in the shape of the thing that is loading.
    return (
      <View style={styles.skeletonThread}>
        {[0, 1, 2].map((row) => (
          <View key={row} style={styles.skeletonStone}>
            <View style={[styles.skeletonLine, styles.skeletonMeta]} />
            <View style={styles.skeletonLine} />
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
    // No stones, no stubs, no shapes. The payload contains a count and a
    // distance, and that is all this state is allowed to show.
    const toGo = metresToGo(detail.distance_m, detail.radius_m);
    return (
      <View style={styles.lockedBlock}>
        <Text style={styles.copy}>
          {detail.stone_count === 0
            ? 'Nothing has been stacked here yet.'
            : `${detail.stone_count} ${detail.stone_count === 1 ? 'stone is' : 'stones are'} stacked here. You have to be standing at the cairn to hear them.`}
        </Text>
        <Text style={styles.meta}>{`walk ${toGo} m closer`}</Text>
      </View>
    );
  }

  if (detail.stone_count === 0) {
    return <Text style={styles.copy}>Nothing has been stacked here yet.</Text>;
  }

  return (
    <View style={styles.thread}>
      {detail.band === 'approaching' ? (
        <Text style={styles.copy}>
          {`Close, but not there. Come within ${detail.radius_m} m and this opens.`}
        </Text>
      ) : null}

      {stones.map((stone) => (
        <StoneRow
          key={stone.id}
          stone={stone}
          unlocked={unlocked}
          degrade={degrade}
          // PLAYBACK SEAM — see StonePlayback in src/thread/StoneRow.tsx. Null
          // until the audio signing route lands: `audio_path` is a storage path
          // in a private bucket and the client cannot sign it. When the route
          // exists, one player lives here (starting a second stone stops the
          // first) and this prop is the only thing that changes.
          playback={null}
        />
      ))}
    </View>
  );
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
    width: s.tap,
    height: s.tap,
    marginLeft: -s.unit * 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    width: 11,
    height: 11,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.t60,
    transform: [{ rotate: '45deg' }],
  },
  title: { ...type.display, color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  meta: { ...type.mono, color: colors.textFaint },
  here: { ...type.mono, color: colors.accent },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: s.gutter, paddingVertical: s.unit * 3, paddingBottom: s.unit * 6 },
  thread: { gap: s.thread },
  lockedBlock: { gap: s.unit * 2 },
  errorBlock: { gap: s.unit * 2, alignItems: 'flex-start' },
  copy: { ...type.body, color: colors.t60 },
  retry: {
    paddingHorizontal: s.pad,
    paddingVertical: s.unit * 1.5,
    borderRadius: s.r.chip,
    // Primary buttons are contour-on-base with a 1pt border. Never an amber
    // fill — amber is a proximity signal, not chrome.
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  retryLabel: { ...type.mono, color: colors.text },
  skeletonThread: { gap: s.thread },
  skeletonStone: { gap: s.unit },
  skeletonLine: { height: 10, borderRadius: s.r.stone, backgroundColor: colors.t20 },
  skeletonMeta: { width: '40%' },
});
