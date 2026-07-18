/**
 * Greedy proximity clustering for the zoomed-out heat map (screen 05).
 *
 * Deliberately dumb: at heat-map zoom the point is "where is the activity",
 * not "exactly which cairn". Cairns are folded left-to-right into the first
 * cluster whose running centroid is within `thresholdDeg`; the caller derives
 * the threshold from the current region so clusters merge as you zoom out.
 * No supercluster dependency for a hackathon's worth of markers.
 */
import type { CairnSummary } from '../../lib/cairnApi';

export interface CairnCluster {
  /** The anchor cairn's id — stable enough for a React key. */
  id: string;
  latitude: number;
  longitude: number;
  /** Total stones across the folded cairns — the "N NOTES" number. */
  noteCount: number;
  /** How many cairns folded in. */
  cairnCount: number;
}

interface WorkingCluster extends CairnCluster {
  latSum: number;
  lngSum: number;
}

/**
 * Degrees-space distance check, longitude corrected for latitude so clusters
 * do not smear east–west. Fine at city scale, which is all the heat map shows.
 */
function withinThreshold(
  cluster: WorkingCluster,
  lat: number,
  lng: number,
  thresholdDeg: number,
): boolean {
  const dLat = cluster.latitude - lat;
  const dLng = (cluster.longitude - lng) * Math.cos((lat * Math.PI) / 180);
  return dLat * dLat + dLng * dLng <= thresholdDeg * thresholdDeg;
}

export function clusterCairns(
  cairns: CairnSummary[],
  thresholdDeg: number,
): CairnCluster[] {
  // Heaviest cairns first, so the biggest pile anchors its cluster and the
  // badge sits on the landmark rather than on a stray single note.
  const ordered = [...cairns].sort((a, b) => b.stone_count - a.stone_count);
  const clusters: WorkingCluster[] = [];

  for (const cairn of ordered) {
    const home = clusters.find((c) =>
      withinThreshold(c, cairn.lat, cairn.lng, thresholdDeg),
    );
    if (home) {
      home.latSum += cairn.lat;
      home.lngSum += cairn.lng;
      home.cairnCount += 1;
      home.noteCount += Math.max(1, cairn.stone_count);
      home.latitude = home.latSum / home.cairnCount;
      home.longitude = home.lngSum / home.cairnCount;
    } else {
      clusters.push({
        id: cairn.id,
        latitude: cairn.lat,
        longitude: cairn.lng,
        latSum: cairn.lat,
        lngSum: cairn.lng,
        noteCount: Math.max(1, cairn.stone_count),
        cairnCount: 1,
      });
    }
  }

  return clusters.map(({ latSum: _lat, lngSum: _lng, ...cluster }) => cluster);
}
