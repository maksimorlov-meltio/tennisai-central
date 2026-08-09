// ============================================================
// TennisAI — Playing conditions: the physics
//
// How air behaves is not a matter of opinion, so it is computed here rather
// than asked of a language model: same inputs, same answer, every time, at no
// cost, and it cannot hallucinate. The model's job (see ai/matchPrep.ts) is to
// say what these numbers MEAN for a given player — which is judgement, not
// arithmetic.
//
// Air density is the standard meteorological calculation. The speed and bounce
// ratings on top of it are deliberately QUALITATIVE: the direction of each
// effect is well established, the exact magnitude for a given ball and court is
// not, and pretending otherwise would be false precision.
// ============================================================

/** Sea-level standard pressure, hPa. */
const P0 = 1013.25;
/** Specific gas constant for dry air, J/(kg·K). */
const R_DRY = 287.058;
/** Specific gas constant for water vapour, J/(kg·K). */
const R_VAPOUR = 461.495;

/**
 * The conditions everything is compared against: a mild sea-level afternoon.
 * Ratings are relative — "faster than what?" needs an answer.
 */
export const REFERENCE = { temperatureC: 20, altitudeM: 0, humidityPct: 50 } as const;

export type Rating = "slower" | "neutral" | "faster";
export type BounceRating = "lower" | "neutral" | "higher";

export interface ConditionsPhysics {
  /** kg/m³ — the number everything else follows from. */
  airDensity: number;
  /** Percent difference from the reference. Negative = thinner air. */
  densityVsReferencePct: number;
  /** Station pressure at this altitude, hPa. */
  pressureHPa: number;
  speed: Rating;
  bounce: BounceRating;
  /** Plain-language drivers, strongest first. Empty when conditions are ordinary. */
  drivers: string[];
}

/** Barometric formula — pressure falls with altitude. */
export function pressureAtAltitude(altitudeM: number): number {
  return P0 * Math.pow(1 - 2.25577e-5 * altitudeM, 5.25588);
}

/** Saturation vapour pressure (Tetens equation), hPa. */
export function saturationVapourPressure(temperatureC: number): number {
  return 6.1078 * Math.pow(10, (7.5 * temperatureC) / (temperatureC + 237.3));
}

/**
 * Density of moist air, kg/m³.
 *
 * Note the sign: humid air is LESS dense than dry air, because a water
 * molecule is lighter than the nitrogen/oxygen it displaces. This surprises
 * people — "heavy humid air" is a real sensation but not a real density. The
 * slowing effect players feel in humidity comes from the BALL absorbing
 * moisture and from their own thermoregulation, not from the air.
 */
export function airDensity(temperatureC: number, altitudeM: number, humidityPct: number): number {
  const tempK = temperatureC + 273.15;
  const pressure = pressureAtAltitude(altitudeM);
  const vapour = (clamp(humidityPct, 0, 100) / 100) * saturationVapourPressure(temperatureC);
  const dry = pressure - vapour;
  // hPa → Pa on both partial pressures.
  return (dry * 100) / (R_DRY * tempK) + (vapour * 100) / (R_VAPOUR * tempK);
}

const REFERENCE_DENSITY = airDensity(
  REFERENCE.temperatureC,
  REFERENCE.altitudeM,
  REFERENCE.humidityPct,
);

/** Below this, a difference is not worth telling a coach about. */
const SPEED_THRESHOLD_PCT = 3;

export function computeConditions(input: {
  temperatureC: number;
  altitudeM: number;
  humidityPct: number;
}): ConditionsPhysics {
  const { temperatureC, altitudeM, humidityPct } = input;
  const density = airDensity(temperatureC, altitudeM, humidityPct);
  const deltaPct = ((density - REFERENCE_DENSITY) / REFERENCE_DENSITY) * 100;

  // Thinner air → less drag → the ball holds its speed and sits up.
  const speed: Rating =
    deltaPct <= -SPEED_THRESHOLD_PCT ? "faster" : deltaPct >= SPEED_THRESHOLD_PCT ? "slower" : "neutral";

  // Bounce follows two separate mechanisms, so it gets its own score rather
  // than being read off density:
  //   - a warm ball is more elastic and rebounds higher (rubber, not air)
  //   - at altitude the ball's internal pressure is high relative to ambient,
  //     which makes it livelier — this is why Bogotá plays the way it does
  const tempEffect = (temperatureC - REFERENCE.temperatureC) / 10; // ~1 per 10°C
  const altitudeEffect = altitudeM / 800; // ~1 per 800m
  const bounceScore = tempEffect + altitudeEffect;
  const bounce: BounceRating = bounceScore >= 1 ? "higher" : bounceScore <= -1 ? "lower" : "neutral";

  const drivers: string[] = [];
  if (altitudeM >= 600) {
    drivers.push(
      `${Math.round(altitudeM)}m altitude — thinner air, the ball travels faster and bounces higher`,
    );
  }
  if (temperatureC >= 28) {
    drivers.push(`${Math.round(temperatureC)}°C — warm air and a livelier ball, quicker conditions`);
  } else if (temperatureC <= 10) {
    drivers.push(
      `${Math.round(temperatureC)}°C — cold, dense air and a stiffer ball, everything sits lower and slower`,
    );
  }
  if (humidityPct >= 80) {
    drivers.push(
      `${Math.round(humidityPct)}% humidity — the air itself is slightly thinner, but balls take on moisture and get heavy as the match goes on`,
    );
  } else if (humidityPct <= 25) {
    drivers.push(`${Math.round(humidityPct)}% humidity — dry air, balls stay light and fast`);
  }

  return {
    airDensity: round(density, 4),
    densityVsReferencePct: round(deltaPct, 1),
    pressureHPa: round(pressureAtAltitude(altitudeM), 1),
    speed,
    bounce,
    drivers,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round(v: number, dp: number): number {
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}
