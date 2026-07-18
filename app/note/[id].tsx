/**
 * Stone thread — CRN-016, with the E3 proximity rendering (CRN-015).
 *
 * Opening a cairn shows its stones newest-at-top, each with author, an absolute
 * mono timestamp, and a kind-specific body. What the client may render is the
 * server's call, not ours: we send position through `fetchCairnDetail` and
 * render the band it hands back —
 *   far          → glyph + distance, nothing else;
 *   approaching  → synthesised stone stacks under a distance-driven blur, no
 *                  playback (the payload carries no audio/image/transcript);
 *   unlocked     → full resolution, playback, transcripts, photo pins, Brief me,
 *                  and the newest voice stone autoplays once per session.
 *
 * One player for the whole thread (single active source), so two stones never
 * talk over each other on stage.
 */
import { BlurView } from 'expo-blur';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BriefMe } from '../../src/features/library/BriefMe';
import { PhotoPinView } from '../../src/features/library/PhotoPinView';
import { StoneWave } from '../../src/features/library/StoneWave';
import { ShareSheet } from '../../src/features/library/ShareSheet';
import { formatDistance, metresBetween } from '../../src/features/library/distance';
import { enablePlaybackAudio } from '../../src/features/library/playbackAudio';
import { formatStamp } from '../../src/features/library/stamp';
import {
  fetchCairnDetail,
  isUnlocked,
  stonePinCount,
  type CairnDetail,
  type CairnStone,
  type UnlockedStone,
} from '../../src/lib/cairnApi';
import { getSupabase } from '../../src/lib/supabase';
import { usePosition } from '../../src/lib/usePosition';
import { colors, type } from '../../src/theme';
import { CairnGlyph, MonoLabel, PlayIcon, PauseIcon, Screen, ShareIcon } from '../../src/ui';

/** Cairns whose newest voice stone has already autoplayed this app session. */
const autoplayed = new Set<string>();

const OUTER_M = 200;

async function signAudio(path: string): Promise<string | null> {
  try {
    const { data } = await getSupabase().storage.from('cairn-audio').createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

async function signImage(path: string): Promise<string | null> {
  try {
    const { data } = await getSupabase().storage.from('cairn-images').createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { coords } = usePosition();

  const [detail, setDetail] = useState<CairnDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [shareOpen, setShareOpen] = useState(false);
  const [photoStone, setPhotoStone] = useState<UnlockedStone | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  // Single player for the whole thread.
  const [activeStoneId, setActiveStoneId] = useState<string | null>(null);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const wantPlay = useRef(false);
  const player = useAudioPlayer(activeUrl ?? null);
  const playerStatus = useAudioPlayerStatus(player);

  const lastFetch = useRef<{ at: { latitude: number; longitude: number }; time: number } | null>(null);

  const load = useCallback(
    async (position: { latitude: number; longitude: number }) => {
      if (!id) return;
      try {
        const next = await fetchCairnDetail(id, position);
        setDetail(next);
        setStatus('ready');
        lastFetch.current = { at: position, time: Date.now() };
      } catch {
        setStatus('error');
      }
    },
    [id],
  );

  // Fetch on focus (fresh signed URLs) and after real movement.
  useFocusEffect(
    useCallback(() => {
      enablePlaybackAudio();
      if (coords) void load(coords);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  useEffect(() => {
    if (!coords) return;
    const prev = lastFetch.current;
    const moved = !prev || metresBetween(prev.at, coords) >= 8;
    const stale = !prev || Date.now() - prev.time >= 4000;
    if (moved && stale) void load(coords);
  }, [coords, load]);

  // Sign photo images once a detail unlocks.
  useEffect(() => {
    if (!detail || !isUnlocked(detail)) {
      setImageUrls({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      for (const stone of detail.stones) {
        const direct = stone.image_url ?? null;
        if (direct) {
          next[stone.id] = direct;
          continue;
        }
        if (stone.image_path) {
          const url = await signImage(stone.image_path);
          if (url) next[stone.id] = url;
        }
      }
      if (!cancelled) setImageUrls(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [detail]);

  // Kick playback once the freshly selected source is loaded.
  useEffect(() => {
    if (wantPlay.current && playerStatus.isLoaded) {
      player.play();
      wantPlay.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerStatus.isLoaded, activeUrl]);

  const playStone = useCallback(
    async (stone: CairnStone) => {
      // Tap the already-active stone → toggle.
      if (activeStoneId === stone.id) {
        if (playerStatus.playing) player.pause();
        else player.play();
        return;
      }
      const path = stone.audio_url ?? stone.audio_path;
      if (!path) return;
      player.pause();
      setActiveStoneId(stone.id);
      wantPlay.current = true;
      if (stone.audio_url) {
        setActiveUrl(stone.audio_url);
      } else {
        const url = await signAudio(path);
        setActiveUrl(url);
      }
    },
    [activeStoneId, player, playerStatus.playing],
  );

  // Autoplay the newest voice stone once per cairn per session, on unlock.
  useEffect(() => {
    if (!detail || !isUnlocked(detail) || autoplayed.has(detail.id)) return;
    const newestVoice = detail.stones.find((st) => st.kind === 'voice' && (st.audio_url || st.audio_path));
    if (!newestVoice) return;
    autoplayed.add(detail.id);
    void playStone(newestVoice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  const progress =
    playerStatus.duration && playerStatus.duration > 0
      ? Math.min(playerStatus.currentTime / playerStatus.duration, 1)
      : 0;

  const band = detail?.band ?? 'far';
  const here = detail ? isUnlocked(detail) : false;
  const distanceLabel = detail
    ? here
      ? 'HERE'
      : formatDistance(detail.distance_m)
    : '';

  // Blur ramp for the approach band (design-system § interpolation).
  const t = useMemo(() => {
    if (!detail || band !== 'approaching') return 1;
    const inner = detail.radius_m || 30;
    return Math.min(1, Math.max(0, (OUTER_M - detail.distance_m) / (OUTER_M - inner)));
  }, [detail, band]);
  const blurIntensity = Math.round(90 * (1 - t));

  const firstTranscript =
    detail && isUnlocked(detail)
      ? detail.stones.find((st) => st.transcript)?.transcript ?? null
      : null;

  return (
    <Screen>
      {/* Header. */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <MonoLabel color={colors.textMuted}>‹ MAP</MonoLabel>
        </Pressable>
        <Pressable onPress={() => setShareOpen(true)} hitSlop={12} disabled={!here}>
          <ShareIcon color={here ? colors.text : colors.t25} />
        </Pressable>
      </View>

      <View style={styles.titleRow}>
        {detail?.space_id ? <View style={styles.spaceSwatch} /> : null}
        <Text style={styles.title} numberOfLines={2}>
          {detail?.title ?? 'Untitled cairn'}
        </Text>
      </View>
      <View style={styles.meta}>
        <MonoLabel size="sm" color={colors.t40}>
          {detail ? `${detail.stone_count} ${detail.stone_count === 1 ? 'STONE' : 'STONES'}` : '—'}
        </MonoLabel>
        <MonoLabel size="sm" color={here ? colors.accent : colors.t40}>
          {distanceLabel}
        </MonoLabel>
      </View>

      {status === 'loading' ? (
        <MonoLabel size="sm" color={colors.textFaint} style={styles.pad}>
          FINDING THIS CAIRN…
        </MonoLabel>
      ) : status === 'error' ? (
        <MonoLabel size="sm" color={colors.textFaint} style={styles.pad}>
          COULD NOT REACH THIS CAIRN
        </MonoLabel>
      ) : !detail ? (
        <Text style={[type.small, styles.pad, { color: colors.textMuted }]}>Nothing here.</Text>
      ) : band === 'far' ? (
        <View style={styles.farState}>
          <CairnGlyph count={detail.stone_count} scale={2.4} />
          <MonoLabel color={colors.t40} style={{ marginTop: 20 }}>
            {formatDistance(detail.distance_m)}
          </MonoLabel>
          <Text style={[type.small, { color: colors.t45, marginTop: 10, textAlign: 'center' }]}>
            Walk closer to open it.
          </Text>
        </View>
      ) : detail.stones.length === 0 ? (
        <Text style={[type.small, styles.pad, { color: colors.textMuted }]}>
          No stones yet. Stand here and leave the first.
        </Text>
      ) : (
        <View style={styles.thread}>
          <ScrollView
            contentContainerStyle={styles.threadContent}
            showsVerticalScrollIndicator={false}
            scrollEnabled={band !== 'approaching'}
          >
            {here ? <BriefMe detail={detail} /> : null}

            {detail.stones.map((stone) => (
              <StoneRow
                key={stone.id}
                stone={stone}
                unlocked={here}
                active={activeStoneId === stone.id}
                playing={activeStoneId === stone.id && playerStatus.playing}
                progress={activeStoneId === stone.id ? progress : 0}
                imageUrl={imageUrls[stone.id]}
                onPlay={() => void playStone(stone)}
                onOpenPhoto={() => isUnlocked(detail) && setPhotoStone(stone as UnlockedStone)}
              />
            ))}
          </ScrollView>

          {/* Approach band: the synthesised stacks sharpen as you close in. */}
          {band === 'approaching' ? (
            <BlurView
              intensity={blurIntensity}
              tint="dark"
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          ) : null}
        </View>
      )}

      <ShareSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        noteId={detail?.id ?? id ?? ''}
        title={detail?.title ?? 'Cairn'}
        transcript={firstTranscript}
      />

      {photoStone && imageUrls[photoStone.id] ? (
        <PhotoPinView
          visible
          onClose={() => setPhotoStone(null)}
          stone={photoStone}
          imageUrl={imageUrls[photoStone.id]}
          authorName={photoStone.author_name}
        />
      ) : null}
    </Screen>
  );
}

// --- One thread row ---------------------------------------------------------

function StoneRow({
  stone,
  unlocked,
  active,
  playing,
  progress,
  imageUrl,
  onPlay,
  onOpenPhoto,
}: {
  stone: CairnStone;
  unlocked: boolean;
  active: boolean;
  playing: boolean;
  progress: number;
  imageUrl?: string;
  onPlay: () => void;
  onOpenPhoto: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <MonoLabel size="xs" color={colors.t60}>
          {stone.author_name.toUpperCase()}
        </MonoLabel>
        <MonoLabel size="xs" color={colors.t40}>
          {formatStamp(stone.created_at)}
        </MonoLabel>
      </View>

      {stone.kind === 'voice' ? (
        <Pressable
          style={styles.voice}
          onPress={unlocked ? onPlay : undefined}
          disabled={!unlocked}
        >
          {unlocked ? (
            <View style={styles.playBtn}>
              {playing ? <PauseIcon size={12} color={colors.background} /> : <PlayIcon size={12} color={colors.background} />}
            </View>
          ) : null}
          <StoneWave seed={stone.id} progress={progress} active={active} />
        </Pressable>
      ) : stone.kind === 'photo' ? (
        <Pressable
          style={[styles.photo, { aspectRatio: stone.image_aspect_ratio || 1.4 }]}
          onPress={unlocked ? onOpenPhoto : undefined}
          disabled={!unlocked}
        >
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.photoSkeleton]} />
          )}
          <View style={styles.pinBadge}>
            <MonoLabel size="xs" color={colors.text}>
              {`${stonePinCount(stone)} ${stonePinCount(stone) === 1 ? 'PIN' : 'PINS'}`}
            </MonoLabel>
          </View>
        </Pressable>
      ) : (
        <Text style={styles.textBody}>{stone.body_text ?? ''}</Text>
      )}

      {unlocked && stone.transcript ? (
        <Text style={styles.transcript}>{stone.transcript}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
  spaceSwatch: { width: 10, height: 10, backgroundColor: colors.accent },
  title: { ...type.title, color: colors.text, flex: 1 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  pad: { marginTop: 40 },
  farState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thread: { flex: 1, marginTop: 20 },
  threadContent: { gap: 24, paddingBottom: 40, paddingTop: 4 },
  row: { gap: 12 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  voice: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  playBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {
    width: '100%',
    backgroundColor: colors.surfaceSolid,
    borderWidth: 1,
    borderColor: colors.t12,
    overflow: 'hidden',
  },
  photoSkeleton: { backgroundColor: colors.t12 },
  pinBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    backgroundColor: colors.scrim,
    borderWidth: 1,
    borderColor: colors.accent50,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  textBody: { ...type.body, fontSize: 16, color: colors.text },
  transcript: { ...type.small, color: colors.t60 },
});
