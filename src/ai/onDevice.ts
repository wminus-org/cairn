/**
 * Apple's on-device AI, loaded defensively.
 *
 * WHY EVERYTHING HERE IS LAZY AND WRAPPED
 * `@react-native-ai/apple` is a TurboModule. `TurboModuleRegistry.getEnforcing`
 * THROWS when the native side is absent, and it throws at import time — so a
 * top-level `import { AppleTranscription } from '@react-native-ai/apple'`
 * takes the whole app down the moment the bundle evaluates, in Expo Go, on
 * every device, before any screen renders.
 *
 * That matters because the app has to keep running in Expo Go while the dev
 * build is being made. So: `require()` inside try/catch, cached, and every
 * capability query is itself guarded. Absent native side means "not available",
 * never a crash.
 *
 * REQUIREMENTS, from the package README:
 *   - iOS 26+
 *   - a device with Apple Intelligence enabled (iPhone 15 Pro or newer)
 *   - New Architecture (SDK 54 default)
 * The podspec builds against Expo's normal deployment target and gates at
 * runtime, which is why we do NOT raise the deployment target to 26 — doing so
 * would drop older phones entirely rather than falling back to cloud on them.
 *
 * THE TIER RULE, which is the whole point of this file:
 *   on-device where it genuinely works  ->  cloud  ->  seeded data
 * Apple's speech APIs cover 42 locales and Slovenian is NOT among them, so for
 * this project the fallback is not a nicety — it is the path a Slovenian
 * recording always takes. `isAvailable(language)` is per-language, so we ask
 * rather than assume.
 */

type TranscriptionSegment = { text: string; startSecond: number; endSecond: number };
type TranscriptionResult = { segments: TranscriptionSegment[]; duration: number };

type AppleModule = {
  AppleTranscription?: {
    isAvailable(language: string): boolean;
    prepare(language: string): Promise<void>;
    transcribe(data: ArrayBufferLike, language: string): Promise<TranscriptionResult>;
  };
  AppleFoundationModels?: {
    isAvailable(): boolean;
    generateText(options: unknown): Promise<unknown>;
  };
  AppleSpeech?: unknown;
};

/** `undefined` = not tried yet, `null` = tried and unavailable. */
let cached: AppleModule | null | undefined;

function load(): AppleModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require('@react-native-ai/apple') as AppleModule;
  } catch {
    // Expo Go, or a build where the native module was not linked. Expected,
    // not exceptional — every caller degrades to the cloud tier.
    cached = null;
  }
  return cached;
}

/** True only in a dev/production build that actually linked the native module. */
export function isOnDeviceAvailable(): boolean {
  return load() !== null;
}

/**
 * Can Apple transcribe THIS language on THIS device?
 *
 * Pass a BCP-47 tag. `sl-SI` returns false on every Apple device — that is the
 * documented locale gap, not a bug, and it is why the cloud tier exists.
 */
export function canTranscribeOnDevice(language: string): boolean {
  const m = load();
  if (!m?.AppleTranscription) return false;
  try {
    return m.AppleTranscription.isAvailable(language);
  } catch {
    return false;
  }
}

/**
 * Download the language model if needed. Safe to call repeatedly.
 *
 * Worth calling ahead of the first recording: the first `transcribe` on a cold
 * locale otherwise pays the model download, and doing that while someone waits
 * for their voice note to resolve is how a demo stalls.
 */
export async function prepareOnDeviceLanguage(language: string): Promise<boolean> {
  const m = load();
  if (!m?.AppleTranscription) return false;
  try {
    await m.AppleTranscription.prepare(language);
    return true;
  } catch {
    return false;
  }
}

/** Transcribe locally. Returns null whenever the on-device path cannot serve. */
export async function transcribeOnDevice(
  audio: ArrayBufferLike,
  language: string,
): Promise<string | null> {
  const m = load();
  if (!m?.AppleTranscription) return null;
  try {
    if (!m.AppleTranscription.isAvailable(language)) return null;
    const result = await m.AppleTranscription.transcribe(audio, language);
    const text = result.segments
      .map((s) => s.text)
      .join(' ')
      .trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

/** Is Apple Foundation Models usable — iOS 26, supported silicon, toggle on? */
export function canSummarizeOnDevice(): boolean {
  const m = load();
  if (!m?.AppleFoundationModels) return false;
  try {
    return m.AppleFoundationModels.isAvailable();
  } catch {
    return false;
  }
}

/**
 * Summarize on-device. Returns null when unavailable OR when the output looks
 * wrong, so the caller falls through to the cloud tier.
 *
 * The length guard is deliberate. `reference/on-device-ai.md` records why:
 * Apple's own Notification Summaries hallucinated badly enough at this exact
 * task shape — condensing several short items — that Apple pulled the feature,
 * and the framework offers a token cap but no word-count guarantee. A briefing
 * that runs long is read aloud on stage. Better to fall back than to ship a
 * ninety-second ramble into a silent room.
 */
export async function summarizeOnDevice(prompt: string): Promise<string | null> {
  const m = load();
  if (!m?.AppleFoundationModels) return null;
  try {
    if (!m.AppleFoundationModels.isAvailable()) return null;
    const raw = await m.AppleFoundationModels.generateText({
      messages: [{ role: 'user', content: prompt }],
    });
    const text = extractText(raw);
    if (!text) return null;

    // ~25 seconds of speech is roughly 60-70 words. Allow slack, reject a bolt.
    const words = text.trim().split(/\s+/).length;
    if (words > 140) return null;
    return text.trim();
  } catch {
    return null;
  }
}

/** The provider's return shape varies by version; take the first thing that reads as text. */
function extractText(raw: unknown): string | null {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    for (const key of ['text', 'content', 'output']) {
      if (typeof o[key] === 'string') return o[key] as string;
    }
  }
  return null;
}

/** One call for the UI: what can this device actually do right now? */
export function describeCapabilities(language: string): {
  nativeLinked: boolean;
  transcription: boolean;
  summary: boolean;
} {
  return {
    nativeLinked: isOnDeviceAvailable(),
    transcription: canTranscribeOnDevice(language),
    summary: canSummarizeOnDevice(),
  };
}
