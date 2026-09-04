// City + country → coordinates.
//
// The ITF calendar publishes a host nation and a city and no coordinates, but
// the app needs them: distance from home is how a coach actually chooses
// between tournaments, and without them an event cannot be placed on the map.
//
// OpenStreetMap's Nominatim is used, under its usage policy: at most one
// request per second, a real identifying User-Agent, and results cached so the
// same city is never asked for twice. That policy is not optional — a job that
// ignores it gets the IP blocked, and would deserve to be.

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const MIN_INTERVAL_MS = 1100; // Nominatim asks for ≤ 1 request per second.

export interface LatLng {
  latitude: number;
  longitude: number;
}

let lastCallAt = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A run-scoped cache. One ITF month lists dozens of events in a handful of
 * countries and repeats cities constantly (Accra appears three weeks running),
 * so this removes most of the calls before they happen.
 */
export class Geocoder {
  private cache = new Map<string, LatLng | null>();
  private hits = 0;
  private lookups = 0;
  private failures = 0;

  constructor(
    private readonly userAgent: string,
    seed: Record<string, LatLng> = {},
  ) {
    for (const [key, value] of Object.entries(seed)) this.cache.set(key.toLowerCase(), value);
  }

  get stats() {
    return { lookups: this.lookups, cacheHits: this.hits, failures: this.failures };
  }

  /**
   * Coordinates for a city, or null when Nominatim has no confident answer.
   *
   * Null is a real outcome and the caller must drop the row rather than
   * substitute the country centroid: an event pinned to the middle of Kazakhstan
   * is worse than an event that is honestly missing, because it silently
   * corrupts every distance calculation that follows.
   */
  async lookup(city: string, country: string): Promise<LatLng | null> {
    const key = `${city.trim()}, ${country.trim()}`.toLowerCase();
    if (this.cache.has(key)) {
      this.hits++;
      return this.cache.get(key)!;
    }

    const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    this.lookups++;

    try {
      const url = `${NOMINATIM}?format=json&limit=1&q=${encodeURIComponent(`${city}, ${country}`)}`;
      const res = await fetch(url, {
        headers: { "User-Agent": this.userAgent, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const body = (await res.json()) as Array<{ lat?: string; lon?: string }>;
      const first = body?.[0];
      const latitude = Number(first?.lat);
      const longitude = Number(first?.lon);

      const found =
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 &&
        Math.abs(longitude) <= 180
          ? { latitude, longitude }
          : null;

      if (!found) this.failures++;
      this.cache.set(key, found);
      return found;
    } catch (err) {
      this.failures++;
      console.warn(`  geocode failed for "${key}": ${err instanceof Error ? err.message : err}`);
      // Cache the failure too — retrying it 40 times in one run helps nobody.
      this.cache.set(key, null);
      return null;
    }
  }
}
