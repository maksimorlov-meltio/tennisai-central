// One implementation of "what are the playing conditions at this tournament",
// shared by the free conditions endpoint and by the AI match-prep endpoint.
// Two copies would drift, and the model would end up reasoning about numbers
// the coach was never shown.

import type { PrismaClient } from "@prisma/client";
import { computeConditions, type ConditionsPhysics } from "./physics";
import { getElevation, getWeather, type WeatherReading } from "./weather";

/**
 * Indoors the roof sets the temperature, not the sky. Halls run at roughly
 * this, so outdoor weather becomes travel context while the physics uses
 * indoor assumptions — keeping altitude, which a roof does not change.
 */
const INDOOR_ASSUMPTION = { temperatureC: 22, humidityPct: 50 };

export interface Conditions {
  tournament: {
    id: string;
    name: string;
    city: string;
    country: string;
    surface: string;
    indoorOutdoor: string;
    ballBrand: string | null;
    startDate: string;
    endDate: string;
  };
  altitudeM: number | null;
  altitudeSource: "catalog" | "derived" | null;
  altitudeAssumed: boolean;
  weather: WeatherReading | null;
  weatherError: string | null;
  physics: ConditionsPhysics | null;
  physicsBasis: "indoor" | "outdoor";
}

/** Returns null when the tournament does not exist. */
export async function loadConditions(
  prisma: PrismaClient,
  tournamentId: string,
): Promise<Conditions | null> {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!t) return null;

  const isIndoor = t.indoorOutdoor === "indoor";

  // Altitude is a fixed property of the place, so a derived value is written
  // back — deriving it once permanently improves the catalog.
  let altitudeM = t.altitude ?? null;
  let altitudeSource: Conditions["altitudeSource"] = altitudeM === null ? null : "catalog";
  if (altitudeM === null && t.latitude !== null && t.longitude !== null) {
    const derived = await getElevation(t.latitude, t.longitude);
    if (derived !== null) {
      altitudeM = Math.round(derived);
      altitudeSource = "derived";
      await prisma.tournament
        .update({ where: { id: t.id }, data: { altitude: altitudeM } })
        .catch(() => undefined); // a failed cache-back must not break the page
    }
  }

  let weather: WeatherReading | null = null;
  let weatherError: string | null = null;
  if (t.latitude !== null && t.longitude !== null) {
    try {
      weather = await getWeather({ latitude: t.latitude, longitude: t.longitude, date: t.startDate });
    } catch (err) {
      // No weather is an honest state. An invented number is not.
      weatherError = err instanceof Error ? err.message : "Weather is unavailable.";
    }
  } else {
    weatherError = "This tournament has no coordinates, so weather cannot be looked up.";
  }

  // Without a temperature there is nothing to compute, and a default would
  // produce a confident, meaningless rating.
  const basis = isIndoor ? INDOOR_ASSUMPTION : weather;
  const physics = basis
    ? computeConditions({
        temperatureC: basis.temperatureC,
        humidityPct: basis.humidityPct,
        altitudeM: altitudeM ?? 0,
      })
    : null;

  return {
    tournament: {
      id: t.id,
      name: t.name,
      city: t.city,
      country: t.country,
      surface: t.surface,
      indoorOutdoor: t.indoorOutdoor,
      ballBrand: t.ballBrand ?? null,
      startDate: t.startDate.toISOString(),
      endDate: t.endDate.toISOString(),
    },
    altitudeM,
    altitudeSource,
    altitudeAssumed: altitudeM === null,
    weather,
    weatherError,
    physics,
    physicsBasis: isIndoor ? "indoor" : "outdoor",
  };
}
