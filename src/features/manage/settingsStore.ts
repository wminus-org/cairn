/**
 * Local app settings (screen 14), persisted as one JSON blob under
 * `cairn.settings` in AsyncStorage.
 *
 * One deliberate side-channel: the capture flow reads `cairn.skipSavePrompt`
 * to decide whether to show the name/category popup after a recording. That
 * key is kept in sync on every persist — `askForName === true` means
 * `skipSavePrompt === false` — so the two features cannot drift apart.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const SETTINGS_KEY = 'cairn.settings';
const SKIP_SAVE_PROMPT_KEY = 'cairn.skipSavePrompt';

export type NoteVisibility = 'PUBLIC' | 'TEAM' | 'PRIVATE';
export type MaxLengthLabel = '1 MIN' | '3 MIN' | '5 MIN';

export interface CairnSettings {
  /** Popup after each recording. Mirrored (inverted) into `cairn.skipSavePrompt`. */
  askForName: boolean;
  /** For new notes. */
  defaultVisibility: NoteVisibility;
  maxLength: MaxLengthLabel;
  heatMapWhenZoomedOut: boolean;
  showPublicNotes: boolean;
  /** "Audio never leaves the phone." */
  onDeviceTranscription: boolean;
}

export const DEFAULT_SETTINGS: CairnSettings = {
  askForName: true,
  defaultVisibility: 'PUBLIC',
  maxLength: '1 MIN',
  heatMapWhenZoomedOut: true,
  showPublicNotes: true,
  onDeviceTranscription: true,
};

export const VISIBILITY_ORDER: readonly NoteVisibility[] = ['PUBLIC', 'TEAM', 'PRIVATE'];
export const MAX_LENGTH_ORDER: readonly MaxLengthLabel[] = ['1 MIN', '3 MIN', '5 MIN'];

/** The next value in a cycle — for the "PUBLIC ▾" style tap-to-cycle rows. */
export function cycleNext<T>(order: readonly T[], current: T): T {
  const index = order.indexOf(current);
  return order[(index + 1) % order.length] as T;
}

function isVisibility(value: unknown): value is NoteVisibility {
  return value === 'PUBLIC' || value === 'TEAM' || value === 'PRIVATE';
}

function isMaxLength(value: unknown): value is MaxLengthLabel {
  return value === '1 MIN' || value === '3 MIN' || value === '5 MIN';
}

/** Field-by-field validation so a stale or hand-edited blob never crashes a render. */
function sanitize(raw: unknown): CairnSettings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SETTINGS;
  const record = raw as Record<string, unknown>;
  return {
    askForName:
      typeof record.askForName === 'boolean' ? record.askForName : DEFAULT_SETTINGS.askForName,
    defaultVisibility: isVisibility(record.defaultVisibility)
      ? record.defaultVisibility
      : DEFAULT_SETTINGS.defaultVisibility,
    maxLength: isMaxLength(record.maxLength) ? record.maxLength : DEFAULT_SETTINGS.maxLength,
    heatMapWhenZoomedOut:
      typeof record.heatMapWhenZoomedOut === 'boolean'
        ? record.heatMapWhenZoomedOut
        : DEFAULT_SETTINGS.heatMapWhenZoomedOut,
    showPublicNotes:
      typeof record.showPublicNotes === 'boolean'
        ? record.showPublicNotes
        : DEFAULT_SETTINGS.showPublicNotes,
    onDeviceTranscription:
      typeof record.onDeviceTranscription === 'boolean'
        ? record.onDeviceTranscription
        : DEFAULT_SETTINGS.onDeviceTranscription,
  };
}

export async function getSettings(): Promise<CairnSettings> {
  try {
    const json = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!json) return DEFAULT_SETTINGS;
    return sanitize(JSON.parse(json) as unknown);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function persist(next: CairnSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  // Keep the capture flow's key in lockstep: ask ⇒ don't skip.
  await AsyncStorage.setItem(SKIP_SAVE_PROMPT_KEY, JSON.stringify(!next.askForName));
}

/** Merge-and-persist for non-React callers. Returns the merged result. */
export async function setSettings(patch: Partial<CairnSettings>): Promise<CairnSettings> {
  const next = { ...(await getSettings()), ...patch };
  await persist(next);
  return next;
}

export interface UseSettingsResult {
  settings: CairnSettings;
  /** False until the stored blob has been read; defaults render meanwhile. */
  ready: boolean;
  /** Optimistic: local state updates immediately, AsyncStorage follows. */
  update: (patch: Partial<CairnSettings>) => void;
}

export function useSettings(): UseSettingsResult {
  const [settings, setLocal] = useState<CairnSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void getSettings().then((stored) => {
      if (!alive) return;
      setLocal(stored);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback((patch: Partial<CairnSettings>) => {
    setLocal((previous) => {
      const next = { ...previous, ...patch };
      void persist(next).catch((error: unknown) => {
        console.warn('[cairn] settings persist failed:', error);
      });
      return next;
    });
  }, []);

  return { settings, ready, update };
}
