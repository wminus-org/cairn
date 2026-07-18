/**
 * Playback + signed-media hooks for the library screens.
 *
 * THE GATE IS SACRED. Every hook here checks `isUnlocked(detail)` before it
 * touches a path, signs a URL or hands anything to a player. Outside the
 * `unlocked` band the gated keys do not exist on the payload at all, and these
 * hooks return null / {} without making a single network request. Do not
 * "optimize" that away.
 */
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useState } from 'react';

import { isUnlocked, type CairnDetail } from '../../lib/cairnApi';
import { getSupabase, type CairnBucket } from '../../lib/supabase';
import { formatClock } from './distance';

const SIGN_TTL_S = 3600;

/**
 * Sign a storage path into a playable/renderable URL. Degrades to `null` on
 * any failure — the caller renders a disabled control, never an error screen.
 */
async function signPath(bucket: CairnBucket, path: string): Promise<string | null> {
  try {
    const { data, error } = await getSupabase()
      .storage.from(bucket)
      .createSignedUrl(path, SIGN_TTL_S);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * The URL of the first audio-bearing stone — but ONLY when the server has
 * released the detail in full. Prefers the Edge Function's `audio_url`; falls
 * back to signing `audio_path` itself; returns null (play disabled) if both
 * are absent or signing errors.
 */
export function useUnlockedStoneAudioUrl(detail: CairnDetail | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  const unlocked = detail !== null && isUnlocked(detail);
  const stone = unlocked
    ? detail.stones.find((st) => st.audio_url || st.audio_path)
    : undefined;
  const direct = stone?.audio_url ?? null;
  const path = stone?.audio_path ?? null;

  useEffect(() => {
    if (!unlocked || (!direct && !path)) {
      setUrl(null);
      return;
    }
    if (direct) {
      setUrl(direct);
      return;
    }
    let cancelled = false;
    setUrl(null);
    void signPath('cairn-audio', path as string).then((signed) => {
      if (!cancelled) setUrl(signed);
    });
    return () => {
      cancelled = true;
    };
  }, [unlocked, direct, path]);

  return unlocked ? url : null;
}

/**
 * stone id → renderable image URL, for every image-bearing stone — unlocked
 * band only. Stones whose URL cannot be resolved are simply absent from the
 * map (the block does not render).
 */
export function useUnlockedImageUrls(detail: CairnDetail | null): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  const unlocked = detail !== null && isUnlocked(detail);
  const wanted = unlocked
    ? detail.stones
        .filter((st) => st.image_url || st.image_path)
        .map((st) => ({
          id: st.id,
          url: st.image_url ?? null,
          path: st.image_path ?? null,
        }))
    : [];
  const wantedKey = wanted.map((w) => `${w.id}:${w.url ?? w.path ?? ''}`).join('|');

  useEffect(() => {
    if (!unlocked || wanted.length === 0) {
      setUrls({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      for (const w of wanted) {
        if (w.url) {
          next[w.id] = w.url;
          continue;
        }
        if (!w.path) continue;
        const signed = await signPath('cairn-images', w.path);
        if (signed) next[w.id] = signed;
      }
      if (!cancelled) setUrls(next);
    })();
    return () => {
      cancelled = true;
    };
    // `wantedKey` is the stable identity of `wanted`; listing the array itself
    // would re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, wantedKey]);

  return unlocked ? urls : {};
}

export interface Playback {
  /** False disables the play control entirely — no URL, or not loaded yet. */
  canPlay: boolean;
  playing: boolean;
  /** 0..1 for the progress track. */
  progress: number;
  /** "0:12 / 0:42". */
  timeLabel: string;
  toggle: () => void;
}

/**
 * expo-audio wrapped for the transcription screen. Pass `null` (locked, no
 * audio, signing failed) and everything stays inert: no source is loaded and
 * `toggle` is a no-op.
 */
export function usePlayback(url: string | null): Playback {
  const player = useAudioPlayer(url ?? null);
  const status = useAudioPlayerStatus(player);

  const duration = Number.isFinite(status.duration) && status.duration > 0 ? status.duration : 0;
  const current = Number.isFinite(status.currentTime) ? status.currentTime : 0;
  const canPlay = url !== null && status.isLoaded;

  const toggle = () => {
    if (!canPlay) return;
    if (status.playing) {
      player.pause();
      return;
    }
    if (duration > 0 && current >= duration - 0.05) {
      void player.seekTo(0);
    }
    player.play();
  };

  return {
    canPlay,
    playing: status.playing,
    progress: duration > 0 ? Math.min(current / duration, 1) : 0,
    timeLabel: `${formatClock(current)} / ${formatClock(duration)}`,
    toggle,
  };
}
