// Grid clustering for map pins.
//
// The map was written for 26 curated tournaments and now has more than three
// thousand. Leaflet renders one DOM node per marker, so plotting them
// individually locks the browser; clustering keeps the whole world on screen
// and readable, and the count on each circle is information a coach wants
// anyway — "142 events in central Europe" is the answer to a real question.
//
// A grid rather than a distance-based algorithm on purpose: it is O(n), stable
// (the same input always yields the same clusters, so pins do not jitter as the
// map redraws), and simple enough to reason about. Pretty clustering matters
// far less here than never showing a wrong count.

export interface Pinnable {
  id: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface Cluster<T extends Pinnable> {
  /** Stable across renders for the same input — usable as a React key. */
  id: string;
  /** Mean position of the members, so the circle sits over its own points. */
  latitude: number;
  longitude: number;
  items: T[];
}

/**
 * Cell size in degrees for a given Leaflet zoom level.
 *
 * Roughly 60 pixels' worth of degrees at each zoom, which keeps circles from
 * overlapping without collapsing distinct cities into one blob. At zoom 12 and
 * above the cell is small enough that clustering stops mattering, and
 * `clusterTournaments` returns singletons.
 */
export function cellSizeForZoom(zoom: number): number {
  // 360° spans 256·2^zoom pixels in the standard web-mercator tile scheme.
  const degreesPerPixel = 360 / (256 * Math.pow(2, zoom));
  return degreesPerPixel * 60;
}

/**
 * Group points into grid cells.
 *
 * Points with no coordinates are dropped: a pin needs somewhere to go, and
 * inventing a position would put a tournament in the wrong country. The caller
 * decides whether to mention the omission.
 *
 * Longitude is normalised into -180..180 first, so a feed that reports 190°
 * lands beside 170° rather than in a cell of its own off the edge of the world.
 */
export function clusterByGrid<T extends Pinnable>(items: T[], cellSize: number): Cluster<T>[] {
  if (cellSize <= 0) throw new Error("cellSize must be positive");

  const cells = new Map<string, T[]>();

  for (const item of items) {
    const lat = item.latitude;
    const lon = item.longitude;
    if (lat == null || lon == null) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (Math.abs(lat) > 90) continue;

    const wrapped = normaliseLongitude(lon);
    const row = Math.floor(lat / cellSize);
    const col = Math.floor(wrapped / cellSize);
    const key = `${row}:${col}`;

    const bucket = cells.get(key);
    if (bucket) bucket.push(item);
    else cells.set(key, [item]);
  }

  const out: Cluster<T>[] = [];
  for (const [key, group] of cells) {
    let latSum = 0;
    let lonSum = 0;
    for (const g of group) {
      latSum += g.latitude as number;
      lonSum += normaliseLongitude(g.longitude as number);
    }
    out.push({
      // Keyed by cell AND by the first member, so a cluster whose contents
      // change (a filter was applied) is a different React node rather than a
      // stale one holding an open popup for a pin that is gone.
      id: `${key}:${group[0].id}:${group.length}`,
      latitude: latSum / group.length,
      longitude: lonSum / group.length,
      items: group,
    });
  }

  // Biggest first: with hundreds of circles, the ones carrying the most events
  // should paint last and therefore on top.
  return out.sort((a, b) => a.items.length - b.items.length);
}

/** Wrap any longitude into -180..180. */
export function normaliseLongitude(lon: number): number {
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  // -180 and 180 are the same meridian; pick one so they share a cell.
  return wrapped === -180 ? 180 : wrapped;
}

/** Convenience wrapper: cluster for a zoom level. */
export function clusterForZoom<T extends Pinnable>(items: T[], zoom: number): Cluster<T>[] {
  return clusterByGrid(items, cellSizeForZoom(zoom));
}

/** How many of these have somewhere to be drawn. */
export function plottableCount(items: Pinnable[]): number {
  return items.filter(
    (i) =>
      i.latitude != null &&
      i.longitude != null &&
      Number.isFinite(i.latitude) &&
      Number.isFinite(i.longitude),
  ).length;
}
