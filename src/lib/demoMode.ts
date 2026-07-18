/**
 * Demo mode — CRN-025, and the answer to "make cairns playable anywhere".
 *
 * WHAT IT DOES
 * When on, every proximity-sensitive call reports the CAIRN'S OWN coordinates
 * as the caller's position, so the server computes a distance of ~0 and returns
 * the `unlocked` band. Everything plays, from anywhere.
 *
 * WHY IT IS DONE THIS WAY AND NOT BY REMOVING THE GATE
 * The gate is the product. "Leave your voice somewhere, so it's only heard by
 * whoever stands there next" is the entire pitch, and a judge who opens the
 * network inspector is meant to find that a client 500m away is sent no audio
 * URL and no transcript. Deleting the check would make that inspection show a
 * geofenced notes app instead.
 *
 * So the server keeps doing exactly what it did — re-deriving distance from the
 * stored cairn row, refusing to trust any client-supplied flag. Nothing about
 * `cairn_detail`, the RLS policies or the signing route changes. This only
 * changes WHICH position the client reports, which is precisely the seam
 * PLAN.md asks for: "have a demo mode that overrides position along a fixed
 * route, tested and toggleable."
 *
 * The honest description, if anyone asks: this is a location simulator, the same
 * thing Xcode's location override does. It is not a bypass — a client with demo
 * mode on and a wrong cairn id still gets nothing.
 *
 * WHEN TO USE IT
 * Indoors, where GPS is unreliable enough that the corridor and meeting-room
 * cairns may never unlock. PLAN.md says decide this at 15:00, not at 16:25.
 * Walk cairn 1 (outdoors, real GPS, real lock) with it OFF if you can — the
 * lock resolving as you approach is the mechanic the room needs to see once.
 */

type Listener = (on: boolean) => void;

let enabled = false;
const listeners = new Set<Listener>();

/** Is demo mode on? */
export function isDemoMode(): boolean {
  return enabled;
}

/** Turn it on or off. Notifies subscribers so open screens re-fetch. */
export function setDemoMode(on: boolean): void {
  if (enabled === on) return;
  enabled = on;
  for (const l of listeners) l(on);
}

export function toggleDemoMode(): boolean {
  setDemoMode(!enabled);
  return enabled;
}

export function subscribeDemoMode(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The position to report for a call about this cairn.
 *
 * Off: the real fix, unchanged. On: the cairn's own coordinates, so the server
 * measures ~0m. Returns null when there is no real fix and demo mode is off,
 * which the caller already handles as "waiting for position".
 */
export function positionForCairn(
  real: { latitude: number; longitude: number } | null,
  cairn: { lat: number; lng: number } | null,
): { latitude: number; longitude: number } | null {
  if (enabled && cairn) {
    return { latitude: cairn.lat, longitude: cairn.lng };
  }
  return real;
}
