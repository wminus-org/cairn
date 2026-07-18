# On-device AI — researched, deferred

Researched 2026-07-18, build day. **Decision: build neither today.** Both stay on the roadmap; nothing on the board moves.

The question was whether Apple's on-device APIs could replace the cloud calls in CRN-022 (transcription) and CRN-023 ("Brief me") — free, offline, no per-user cost.

## Why both are deferred

The reasoning that settles it is not about either API's quality. It is that **the demo path does not touch them.**

CRN-027 seeds transcripts directly into `stones.transcript`, and CRN-023 caches its output into the `briefings` row before the pitch. So on stage there is no transcription call and no model call — there is a database read. **A cached briefing is safer than an on-device one**, because it cannot fail, cannot be slow, and cannot hallucinate a new sentence the third time you rehearse it.

So neither is a risk reduction. Both are cost and story optimizations, and building either would spend the 13:15 hour that CRN-013 needs. Pins are the product.

## Transcription — viable, one hard blocker

| | |
|---|---|
| **Package** | `expo-speech-recognition` (jamsch) — v56.0.1, MIT, 652★, actively maintained. Has an Expo config plugin and supports file-based transcription via `start({ audioSource: { uri } })`. No custom native module needed. |
| **API underneath** | `SFSpeechRecognizer` with `requiresOnDeviceRecognition = true`. iOS 13+. |
| **iOS 26 option** | `SpeechAnalyzer` / `SpeechTranscriber` — better, and notably does **not** need Apple-Intelligence-class hardware, just iOS 26. No Expo/RN wrapper exists for it as of July 2026. |
| **Accuracy** | `SpeechTranscriber` 2.12% WER clean / 4.56% noisy, versus Whisper Small at 3.74% / 7.95%. Legacy `SFSpeechRecognizer` is much worse at 9.02%. English read speech only — accented and far-field are untested. |
| **Cost** | Free, no key, offline after a one-time per-locale model download. |
| **Permissions** | `NSSpeechRecognitionUsageDescription` is required and its absence **crashes the app** on authorization. Separate prompt from the microphone one. |

**The blocker: Slovenian is not supported.** Not by `SFSpeechRecognizer` (64 dictation locales) and not by `SpeechTranscriber` (42 locales, no `sl-SI`). Slovenian became an iOS keyboard/UI language in iOS 18, but that is localization, not speech recognition.

So the language of the recorded audio decides this. English content → on-device works and is free. Slovenian content → cloud API, no way around it.

**Unverified:** whether `expo-speech-recognition`'s iOS file path accepts `.m4a` directly — its docs list WAV and mono MP3, while the raw `SFSpeechURLRecognitionRequest` API does accept `.m4a`. Worth a 15-minute spike before committing, not an assumption.

## Brief me on Foundation Models — recommend against

Not on availability grounds. On quality, at exactly this task shape.

- **Apple's own Notification Summaries** — condensing several short items into a digest — hallucinated badly enough in production (inventing a darts championship result from a BBC notification, garbling NYT headlines) that Apple **pulled it from news apps in January 2025**. That is Apple's team, with full model access, failing at the closest analog to our feature.
- Our synthesis needs **cross-document attribution** across eleven stones and four authors spanning three months. Misattributing a line to the wrong technician, or inventing a resolution nobody said, is a specific and plausible failure — in the one silent moment of the pitch.
- **No hard word-count control.** Only `maximumResponseTokens`, a cap that truncates. Prompt-level "under 70 words" is best-effort. An overlong summary read aloud on stage, or one cut off mid-sentence, is the disaster the ticket is written to avoid.
- **Requirements:** iOS 26+, A17 Pro or newer — iPhone 15 Pro/Pro Max only from the 15 line, base 15 excluded. ~3B parameters, 4,096-token context (ample for eleven short notes; not the bottleneck).
- **The trap:** the user must enable Apple Intelligence in Settings, and first enablement triggers a **~1.6GB background model download that wants Wi-Fi and power**. That reintroduces the exact venue-wifi failure this was meant to route around, and it cannot be fixed at the venue.

Best available bridge if it is ever revisited: `@react-native-ai/apple` (Callstack) — the only maintained option, Vercel AI SDK-compatible, requires New Architecture. Roughly 3–5 hours to integrate, 8–14 to write a module from scratch.

## What to do instead, today

Say it. The unit economics are a real VC-shaped sentence and cost nothing to deliver:

> Transcription runs on the phone, so free-tier users cost us nothing per minute.

That is true, defensible, and available in the pitch without a line of code. See [`positioning.md`](positioning.md).

## If revisited after the hackathon

1. Spike `expo-speech-recognition` with a real `.m4a` on a physical device — 15 minutes, settles the format question.
2. Tier transcription: on-device for supported locales → cloud for Slovenian and anything else → seeded transcript. The tiering already matches how [`scope-and-risks.md`](scope-and-risks.md) treats every other capability.
3. Leave "Brief me" on Claude. Revisit Foundation Models only with a measured test against real transcript sets, not a demo.
