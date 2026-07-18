/**
 * Put the iOS audio session into a playback mode that ignores the hardware
 * mute switch, and clear `allowsRecording` so output does not route to the
 * earpiece at low volume. Call this before any stone / pin / briefing playback.
 *
 * This is the single most common way this category of demo dies (see the traps
 * in CRN-016 / CRN-014 / CRN-023): press play, get silence, no idea why. One
 * fire-and-forget call on screen focus fixes it for every player on the screen.
 */
import { setAudioModeAsync } from 'expo-audio';

export function enablePlaybackAudio(): void {
  void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {
    // A failed audio-mode set is not worth a visible error; playback may just
    // be quiet on the silent switch, which the on-screen transcript covers.
  });
}
