/**
 * The recording half of the capture flow (screen 06).
 *
 * Wraps expo-audio's `useAudioRecorder` with the three things the screen
 * needs and nothing else: mic permission asked on mount, recording started
 * as soon as it is granted, and a `finish()` that resolves to the file URI
 * plus a whole-second duration for the save screen.
 *
 * Metering is enabled on top of HIGH_QUALITY so the waveform can read real
 * levels via `readLevel()`. On platforms where metering never arrives,
 * `readLevel()` returns null and the caller animates a plausible bar
 * instead — the bar visual is load-bearing, the data behind it is not.
 */
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

export type MicPermission = 'pending' | 'granted' | 'denied';

export interface FinishedRecording {
  /** `file://` URI of the .m4a, or null when the recorder produced nothing. */
  uri: string | null;
  /** Whole seconds, at least 1 — the save screen's `durationSec` param. */
  durationSec: number;
}

/** HIGH_QUALITY (.m4a, AAC) with metering, so `state.metering` exists at all. */
const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

/** How often the recorder state (timer, metering) is re-polled, in ms. */
export const RECORDER_POLL_MS = 100;

export interface Recorder {
  permission: MicPermission;
  /** Live duration in ms; drives the 52pt timer and the 60s cap. */
  durationMillis: number;
  isRecording: boolean;
  /**
   * Latest metering value normalized to 0–1, or null when the platform
   * reports none. Safe to call from an interval.
   */
  readLevel: () => number | null;
  /** Stop and hand back the file. Idempotent; the second call re-resolves. */
  finish: () => Promise<FinishedRecording>;
  /** Stop and forget. For ✕ DISCARD. */
  discard: () => void;
}

export function useRecorder(): Recorder {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const state = useAudioRecorderState(recorder, RECORDER_POLL_MS);
  const [permission, setPermission] = useState<MicPermission>('pending');

  /** Set the moment stop is requested, so a late `record()` cannot fire. */
  const stoppedRef = useRef(false);
  /** The last duration seen before stop reset the recorder to 0. */
  const lastDurationRef = useRef(0);
  if (state.durationMillis > lastDurationRef.current) {
    lastDurationRef.current = state.durationMillis;
  }

  useEffect(() => {
    let active = true;

    const begin = async () => {
      const response = await AudioModule.requestRecordingPermissionsAsync();
      if (!active) return;
      if (!response.granted) {
        setPermission('denied');
        return;
      }
      setPermission('granted');

      // Without `allowsRecording` iOS records silence; without
      // `playsInSilentMode` the eventual playback dies on the mute switch.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      // StrictMode double-mounts and a fast discard both land here late.
      if (!active || stoppedRef.current) return;
      recorder.record();
    };

    begin().catch((error: unknown) => {
      if (!active) return;
      console.warn('[cairn] recorder failed to start:', error);
      setPermission('denied');
    });

    return () => {
      active = false;
    };
  }, [recorder]);

  const readLevel = useCallback((): number | null => {
    try {
      const metering = recorder.getStatus().metering;
      if (typeof metering !== 'number' || !Number.isFinite(metering)) return null;
      // dBFS, roughly -60 (quiet) … 0 (clipping) → 0–1.
      return Math.min(1, Math.max(0, (metering + 60) / 60));
    } catch {
      return null;
    }
  }, [recorder]);

  const finish = useCallback(async (): Promise<FinishedRecording> => {
    stoppedRef.current = true;
    try {
      await recorder.stop();
    } catch (error) {
      // Already stopped, or never started — the uri below still tells the truth.
      console.warn('[cairn] recorder stop:', error);
    }
    const durationSec = Math.max(1, Math.round(lastDurationRef.current / 1000));
    return { uri: recorder.uri, durationSec };
  }, [recorder]);

  const discard = useCallback(() => {
    stoppedRef.current = true;
    recorder.stop().catch(() => {
      /* nothing to keep either way */
    });
  }, [recorder]);

  return {
    permission,
    durationMillis: state.durationMillis,
    isRecording: state.isRecording,
    readLevel,
    finish,
    discard,
  };
}
