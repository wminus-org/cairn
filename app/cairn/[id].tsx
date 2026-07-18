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
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  fetchCairnDetail,
  getStoneAudioUrl,
  isCairnApiError,
  requestBriefing,
  requestTranscription,
  type CairnDetail,
  type CairnStone,
} from '../../src/lib/cairnApi';
import { usePosition, type PositionCoords } from '../../src/lib/usePosition';
import StoneRow, { type StoneDegrade, type StonePlayback } from '../../src/thread/StoneRow';
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
  /** Stones with a request open right now. Drives the pending line, nothing else. */
  const [transcribing, setTranscribing] = useState<ReadonlySet<string>>(() => new Set());

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

      const stoneId = stone.id;
      setTranscribing((prev) => new Set(prev).add(stoneId));

      void requestTranscription(cairnId, stoneId, at)
        .then((transcript) => {
          if (!transcript) return;
          setDetail((prev) =>
            prev
              ? {
                  ...prev,
                  stones: prev.stones.map((row) =>
                    row.id === stoneId ? { ...row, transcript } : row,
                  ),
                }
              : prev,
          );
        })
        // Clears on every outcome, including the null one. A pending line that
        // outlives its request is worse than no pending line at all — it reads
        // as a transcript still coming when the answer already arrived and was
        // "none". `requestTranscription` never rejects, so this only ever runs
        // as the success path; it is `finally` so that stays true if it changes.
        .finally(() => {
          setTranscribing((prev) => {
            const next = new Set(prev);
            next.delete(stoneId);
            return next;
          });
        });
    }
  }, [cairnId, detail]);

  // --- Brief me (CRN-023) ---------------------------------------------------

  const [briefPhase, setBriefPhase] = useState<BriefPhase>('idle');
  /** Kept after speech ends: this text IS the fallback if the speaker fails. */
  const [briefText, setBriefText] = useState<string | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);

  /**
   * The phone must stop talking when this screen goes away. A briefing that
   * keeps narrating over the next part of the pitch is funny exactly once.
   * Also fires on a cairn change, so walking from one cairn to another does not
   * leave the previous one's synthesis running.
   */
  useEffect(() => {
    return () => {
      void Speech.stop();
    };
  }, [cairnId]);

  /** A new cairn is a new briefing. Never show one cairn's text under another. */
  useEffect(() => {
    setBriefPhase('idle');
    setBriefText(null);
    setBriefError(null);
  }, [cairnId]);

  /**
   * One press, and the phone talks. No confirmation, no modal to dismiss, no
   * play button that appears afterwards — the pitch says "with a drill in your
   * other hand", and a second tap makes that untrue.
   *
   * The summary is set on screen BEFORE `Speech.speak`, deliberately. DEMO.md's
   * stage fallback is the presenter reading the first two lines aloud when the
   * speaker fails, and text that only appears in `onStart` is text that is not
   * there in exactly the case it is needed.
   */
  const onBrief = useCallback(async () => {
    if (briefPhase === 'working') return;

    // Speaking already? Stop. This is the only way to shut it up mid-briefing,
    // and pressing the button again is where everyone reaches first.
    if (briefPhase === 'speaking') {
      void Speech.stop();
      setBriefPhase('idle');
      return;
    }

    const at = coordsRef.current;
    if (!at) return;

    setBriefError(null);
    setBriefPhase('working');

    try {
      const briefing = await requestBriefing(cairnId, at);
      setBriefText(briefing.summary);

      // The silent switch will otherwise eat this entirely: under the default
      // iOS audio session a phone with the ring switch flipped speaks nothing,
      // with no error and no clue why. Failing to set the mode is not a reason
      // to skip the speech — a phone that is not on silent still works.
      try {
        await setAudioModeAsync({ playsInSilentMode: true });
      } catch {
        // Nothing to say to the walker about an audio session.
      }

      setBriefPhase('speaking');
      Speech.speak(briefing.summary, {
        onDone: () => setBriefPhase('idle'),
        onStopped: () => setBriefPhase('idle'),
        // TTS failing must not clear the text — it is the whole fallback.
        onError: () => setBriefPhase('idle'),
      });
    } catch (err) {
      const failure = isCairnApiError(err) ? err : null;
      setBriefPhase('idle');
      if (failure?.kind === 'too-far') {
        setBriefError('You have walked out of range. Come back for the briefing.');
        // The screen says "here" and the gate just said otherwise. Refetch so it
        // stops making a promise the server will not keep.
        void load(at);
      } else {
        setBriefError(
          failure?.kind === 'unauthenticated'
            ? 'Signed out. Reopen the app to sign back in.'
            : 'Could not put a briefing together just now.',
        );
      }
    }
  }, [briefPhase, cairnId, load]);

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

  /**
   * Null means no Brief me button at all.
   *
   * Two stones with words in them is the floor: a synthesis of one note is that
   * note read back, which makes the feature look like a gimmick in the one
   * moment it has to look like the product. Text stones count — `body_text` is
   * a text stone's transcript, and the route reads it the same way.
   *
   * The band check is not a distance check. Below 'unlocked' the transcripts
   * are not in the payload at all, so there is nothing to count and nothing to
   * brief; the button is missing for the same reason the content is.
   */
  const brief = useMemo<BriefControl | null>(() => {
    if (!unlocked || !detail) return null;
    const speakable = detail.stones.filter(
      (stone) => (stone.transcript ?? stone.body_text ?? '').trim().length > 0,
    ).length;
    if (speakable < 2) return null;

    return {
      phase: briefPhase,
      text: briefText,
      error: briefError,
      onPress: () => void onBrief(),
    };
  }, [briefError, briefPhase, briefText, detail, onBrief, unlocked]);

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

        {errorText || playbackError ? (
          <Text style={styles.meta}>{errorText ?? playbackError}</Text>
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
          playbackFor={playbackFor}
          transcribing={transcribing}
          brief={brief}
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
  playbackFor,
  transcribing,
  brief,
  onRetry,
}: {
  phase: Phase;
  status: string;
  detail: CairnDetail | null;
  stones: CairnStone[];
  degrade: StoneDegrade | null;
  unlocked: boolean;
  playbackFor: (stone: CairnStone) => StonePlayback | null;
  transcribing: ReadonlySet<string>;
  brief: BriefControl | null;
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

      {/* Above the stones, so the summary is on screen without scrolling —
          DEMO.md's stage fallback is the presenter reading it aloud. */}
      {brief ? <BriefMe brief={brief} /> : null}

      {stones.map((stone) => (
        <StoneRow
          key={stone.id}
          stone={stone}
          unlocked={unlocked}
          degrade={degrade}
          playback={playbackFor(stone)}
          transcribing={transcribing.has(stone.id)}
        />
      ))}
    </View>
  );
}

/**
 * `working` is the only phase that has to be visible before anything is
 * audible: a cold generation is three to six seconds of a phone that looks
 * broken. A cached one returns in well under a second and this state barely
 * renders, which is the intent.
 */
type BriefPhase = 'idle' | 'working' | 'speaking';

interface BriefControl {
  phase: BriefPhase;
  /** The synthesis, kept on screen after speech ends. Never markdown. */
  text: string | null;
  error: string | null;
  onPress: () => void;
}

/**
 * The button and the three lines under it.
 *
 * The text is small and low-contrast on purpose. This is a listening surface,
 * not a reading one — if the prose competes for attention, people read instead
 * of listening and the moment the whole build exists for dies. It is here as
 * the fallback for a failed or silent speaker, and nothing larger than that.
 */
function BriefMe({ brief }: { brief: BriefControl }) {
  const speaking = brief.phase === 'speaking';
  const working = brief.phase === 'working';

  return (
    <View style={styles.briefBlock}>
      <Pressable
        onPress={brief.onPress}
        disabled={working}
        style={[styles.briefButton, speaking && styles.briefButtonSpeaking]}
        accessibilityRole="button"
        accessibilityState={{ busy: working }}
        accessibilityLabel={speaking ? 'Stop the briefing' : 'Brief me on this cairn'}
      >
        <Text style={[styles.briefLabel, speaking && styles.briefLabelSpeaking]}>
          {working ? 'putting it together' : speaking ? 'speaking — tap to stop' : 'brief me'}
        </Text>
      </Pressable>

      {brief.text ? <Text style={styles.briefText}>{brief.text}</Text> : null}
      {brief.error ? <Text style={styles.meta}>{brief.error}</Text> : null}
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
  briefBlock: { gap: s.unit * 1.5, alignItems: 'flex-start' },
  briefButton: {
    paddingHorizontal: s.pad,
    paddingVertical: s.unit * 1.5,
    borderRadius: s.r.chip,
    // Contour-on-base, like every other primary control. Amber is a proximity
    // signal, not chrome — so it appears on the BORDER only while the phone is
    // actually talking, which is the one moment the accent is telling the truth.
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  briefButtonSpeaking: { borderColor: colors.accent },
  briefLabel: { ...type.mono, color: colors.text },
  briefLabelSpeaking: { ...type.mono, color: colors.accent },
  /** Small and at 60% — see BriefMe. Deliberately not a reading surface. */
  briefText: { ...type.small, color: colors.t60 },
  skeletonThread: { gap: s.thread },
  skeletonStone: { gap: s.unit },
  skeletonLine: { height: 10, borderRadius: s.r.stone, backgroundColor: colors.t20 },
  skeletonMeta: { width: '40%' },
});
