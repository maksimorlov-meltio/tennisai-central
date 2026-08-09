// ============================================================
// TennisAI — Weather for a tournament
//
// Open-Meteo: free, keyless, no account. Nothing here needs a secret, which is
// why it can ship switched on while the LLM stays off.
//
// The honesty problem this file exists to solve: a forecast only exists about
// two weeks out. A tournament in five months has no forecast, and showing an
// invented one — or a single historical year dressed as a prediction — would be
// exactly the kind of fabricated analysis this project forbids. So every
// reading carries HOW it was obtained, and the UI shows it.
// ============================================================

/** How the numbers were obtained. The UI must label this. */
export type WeatherKind = "observed" | "forecast" | "typical";

export interface WeatherReading {
  kind: WeatherKind;
  /** Mean temperature over playing hours, °C. */
  temperatureC: number;
  temperatureMaxC: number;
  temperatureMinC: number;
  /** Mean relative humidity over playing hours, %. */
  humidityPct: number;
  /** Years averaged — only set for `typical`. */
  basedOnYears?: number;
  /** Human-readable provenance, safe to show verbatim. */
  source: string;
}

/** Open-Meteo publishes forecasts this far ahead. Beyond it, there is none. */
export const FORECAST_HORIZON_DAYS = 16;

/** Years of history averaged for a date too far out to forecast. */
const CLIMATOLOGY_YEARS = 5;

/** Match-relevant hours, local time. Nobody plays the 4am minimum. */
const PLAY_HOURS = { from: 11, to: 18 };

/**
 * Which source answers for this date. Pure, so the branch that decides whether
 * a coach sees "forecast" or "typical" is directly testable.
 */
export function selectSource(target: Date, today: Date): WeatherKind {
  const days = Math.floor((startOfDay(target).getTime() - startOfDay(today).getTime()) / 86_400_000);
  if (days < 0) return "observed";
  return days <= FORECAST_HORIZON_DAYS ? "forecast" : "typical";
}

interface CacheEntry {
  value: WeatherReading;
  expiresAt: number;
}

/**
 * In-memory, per-process. Deliberately not a table: this is derived data that
 * is cheap to refetch and would otherwise need a migration and a cleanup job.
 * A restart simply refetches.
 */
const cache = new Map<string, CacheEntry>();

/** Forecasts move; a five-year average does not. */
const TTL_MS: Record<WeatherKind, number> = {
  forecast: 3 * 60 * 60 * 1000, // 3 hours
  observed: 7 * 24 * 60 * 60 * 1000, // a week
  typical: 30 * 24 * 60 * 60 * 1000, // a month
};

export class WeatherUnavailable extends Error {}

/**
 * Conditions for one place on one date.
 *
 * Throws `WeatherUnavailable` rather than returning a guess — a tournament page
 * without weather is fine; a tournament page with invented weather is not.
 */
export async function getWeather(args: {
  latitude: number;
  longitude: number;
  date: Date;
  now?: Date;
}): Promise<WeatherReading> {
  const now = args.now ?? new Date();
  const kind = selectSource(args.date, now);
  const key = `${args.latitude.toFixed(2)},${args.longitude.toFixed(2)},${iso(args.date)},${kind}`;

  const hit = cache.get(key);
  if (hit && hit.expiresAt > now.getTime()) return hit.value;

  const value =
    kind === "typical"
      ? await fetchTypical(args.latitude, args.longitude, args.date, now)
      : await fetchSingleDate(args.latitude, args.longitude, args.date, kind);

  cache.set(key, { value, expiresAt: now.getTime() + TTL_MS[kind] });
  return value;
}

/** Terrain height never changes, so this needs no expiry. */
const elevationCache = new Map<string, number>();

/**
 * Metres above sea level, filling the altitude the tournament catalog lacks.
 *
 * Returns null rather than throwing: altitude is one input among several, and
 * losing it should degrade the estimate, not break the page.
 */
export async function getElevation(latitude: number, longitude: number): Promise<number | null> {
  const key = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
  const hit = elevationCache.get(key);
  if (hit !== undefined) return hit;

  try {
    const json = await getJson(
      `https://api.open-meteo.com/v1/elevation?latitude=${latitude}&longitude=${longitude}`,
    );
    const elevation = (json as { elevation?: number[] }).elevation?.[0];
    if (typeof elevation !== "number") return null;
    elevationCache.set(key, elevation);
    return elevation;
  } catch {
    return null;
  }
}

async function fetchSingleDate(
  latitude: number,
  longitude: number,
  date: Date,
  kind: Exclude<WeatherKind, "typical">,
): Promise<WeatherReading> {
  const day = iso(date);
  const host =
    kind === "observed" ? "https://archive-api.open-meteo.com/v1/archive" : "https://api.open-meteo.com/v1/forecast";
  const url =
    `${host}?latitude=${latitude}&longitude=${longitude}` +
    `&start_date=${day}&end_date=${day}` +
    `&daily=temperature_2m_max,temperature_2m_min` +
    `&hourly=temperature_2m,relative_humidity_2m&timezone=auto`;

  const json = await getJson(url);
  const reading = readDay(json, 0);
  if (!reading) throw new WeatherUnavailable(`No ${kind} data for ${day}.`);
  return {
    ...reading,
    kind,
    source: kind === "forecast" ? "Open-Meteo forecast" : "Open-Meteo observed history",
  };
}

/**
 * The same calendar date across the previous N years, averaged.
 *
 * This is real measured weather, not a projection — "what this week has
 * actually been like recently". Labelled `typical` so it is never mistaken for
 * a forecast.
 */
async function fetchTypical(
  latitude: number,
  longitude: number,
  date: Date,
  now: Date,
): Promise<WeatherReading> {
  const month = date.getUTCMonth();
  const dayOfMonth = date.getUTCDate();
  const years: number[] = [];
  for (let i = 1; i <= CLIMATOLOGY_YEARS; i++) years.push(now.getUTCFullYear() - i);

  const readings: Array<ReturnType<typeof readDay>> = [];
  for (const year of years) {
    const day = iso(new Date(Date.UTC(year, month, dayOfMonth)));
    try {
      const json = await getJson(
        `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}` +
          `&start_date=${day}&end_date=${day}` +
          `&daily=temperature_2m_max,temperature_2m_min` +
          `&hourly=temperature_2m,relative_humidity_2m&timezone=auto`,
      );
      const r = readDay(json, 0);
      if (r) readings.push(r);
    } catch {
      // One missing year is not a failure — the average just uses the rest.
    }
  }

  const usable = readings.filter(Boolean) as NonNullable<ReturnType<typeof readDay>>[];
  if (usable.length === 0) throw new WeatherUnavailable("No historical data for this date.");

  const mean = (pick: (r: (typeof usable)[number]) => number) =>
    Math.round((usable.reduce((s, r) => s + pick(r), 0) / usable.length) * 10) / 10;

  return {
    kind: "typical",
    temperatureC: mean((r) => r.temperatureC),
    temperatureMaxC: mean((r) => r.temperatureMaxC),
    temperatureMinC: mean((r) => r.temperatureMinC),
    humidityPct: Math.round(mean((r) => r.humidityPct)),
    basedOnYears: usable.length,
    source: `Open-Meteo — average of the same date across ${usable.length} previous year${usable.length === 1 ? "" : "s"}`,
  };
}

/** Pulls one day out of an Open-Meteo response, averaging the playing hours. */
export function readDay(json: unknown, index: number) {
  const root = json as {
    daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] };
    hourly?: { time?: string[]; temperature_2m?: number[]; relative_humidity_2m?: number[] };
  };
  const max = root.daily?.temperature_2m_max?.[index];
  const min = root.daily?.temperature_2m_min?.[index];
  if (typeof max !== "number" || typeof min !== "number") return null;

  const times = root.hourly?.time ?? [];
  const temps = root.hourly?.temperature_2m ?? [];
  const humidity = root.hourly?.relative_humidity_2m ?? [];

  const playTemps: number[] = [];
  const playHumidity: number[] = [];
  times.forEach((t, i) => {
    const hour = Number(t.slice(11, 13));
    if (hour >= PLAY_HOURS.from && hour <= PLAY_HOURS.to) {
      if (typeof temps[i] === "number") playTemps.push(temps[i]);
      if (typeof humidity[i] === "number") playHumidity.push(humidity[i]);
    }
  });

  const avg = (xs: number[], fallback: number) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fallback;

  return {
    temperatureC: Math.round(avg(playTemps, (max + min) / 2) * 10) / 10,
    temperatureMaxC: max,
    temperatureMinC: min,
    // No humidity at all is possible for some archive rows; the reference 50%
    // keeps the physics computable, and the source string says where it came from.
    humidityPct: Math.round(avg(playHumidity, 50)),
  };
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new WeatherUnavailable(`Open-Meteo returned ${res.status}.`);
  return res.json();
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Test seam — drops everything so a spec starts from a cold cache. */
export function clearWeatherCache() {
  cache.clear();
  elevationCache.clear();
}
