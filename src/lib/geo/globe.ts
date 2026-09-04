// Turning tournament coordinates into positions on a sphere.
//
// Split out from the globe component so the maths can be tested without a
// WebGL context: a pin in the wrong hemisphere is the kind of bug that looks
// plausible on screen and is obvious in an assertion.

/** Radius the globe is drawn at. Pins sit fractionally proud of the surface. */
export const GLOBE_RADIUS = 1;
export const PIN_ALTITUDE = 0.012;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Latitude/longitude to a point on a sphere.
 *
 * The convention matters and is easy to get subtly wrong: latitude runs from
 * the equator toward the poles (so it maps to the polar angle measured from
 * +Y), and longitude runs east from Greenwich. With 0°,0° the result sits on
 * +Z, facing the default camera — which is why the Atlantic is what you see
 * when the globe first appears.
 */
export function latLonToVector3(lat: number, lon: number, radius = GLOBE_RADIUS): Vec3 {
  const phi = (90 - lat) * (Math.PI / 180); // polar angle from the north pole
  const theta = lon * (Math.PI / 180); // azimuth, east-positive

  return {
    x: radius * Math.sin(phi) * Math.sin(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.cos(theta),
  };
}

/**
 * Flat array of x,y,z triples for a BufferGeometry.
 *
 * One geometry holding every pin, rather than a mesh each: three thousand
 * meshes is three thousand draw calls and a slideshow, while three thousand
 * points in one buffer is a single call.
 *
 * Anything without usable coordinates is skipped rather than defaulted to
 * 0°,0° — a tournament floating in the Gulf of Guinea is worse than one absent.
 */
export function toPointCloud(
  items: Array<{ latitude?: number | null; longitude?: number | null }>,
  radius = GLOBE_RADIUS + PIN_ALTITUDE,
): Float32Array {
  const usable = items.filter(
    (i) =>
      i.latitude != null &&
      i.longitude != null &&
      Number.isFinite(i.latitude) &&
      Number.isFinite(i.longitude) &&
      Math.abs(i.latitude as number) <= 90,
  );

  const out = new Float32Array(usable.length * 3);
  usable.forEach((item, i) => {
    const { x, y, z } = latLonToVector3(item.latitude as number, item.longitude as number, radius);
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  });
  return out;
}

/**
 * Rotation that brings a coordinate to face the camera.
 *
 * Used to spin the globe to a tournament when one is chosen, so "where is this"
 * is answered by the globe moving rather than the viewer hunting.
 */
export function rotationToFace(lat: number, lon: number): { x: number; y: number } {
  return {
    x: lat * (Math.PI / 180),
    y: -lon * (Math.PI / 180) - Math.PI / 2,
  };
}

// ── Where the sun is ────────────────────────────────────────────────────────

/**
 * The point on Earth with the sun directly overhead, for a given moment.
 *
 * Deliberately the simple astronomical model: declination from the day of the
 * year, and longitude from UTC. It is accurate to roughly a degree, which is
 * far inside the width of the line it draws — this lights a globe, it does not
 * navigate a ship. The equation of time is the term being skipped, and it is
 * worth at most a quarter of a degree here.
 */
export function subsolarPoint(when: Date = new Date()): { lat: number; lon: number } {
  const startOfYear = Date.UTC(when.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((when.getTime() - startOfYear) / 86_400_000);

  // Earth's tilt, projected onto the year. Peaks at the solstices.
  const lat = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));

  // Noon is at 0° longitude at 12:00 UTC, and the sun tracks 15° west an hour.
  const utcHours =
    when.getUTCHours() + when.getUTCMinutes() / 60 + when.getUTCSeconds() / 3600;
  let lon = 180 - utcHours * 15;
  // Keep it in -180..180 so callers can use it as a plain coordinate.
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;

  return { lat, lon };
}

/**
 * A unit vector pointing from the globe's centre toward the sun, in the same
 * frame `latLonToVector3` uses. Used as the light's position, so the day/night
 * terminator falls where it actually is right now.
 */
export function sunDirection(when: Date = new Date()): Vec3 {
  const { lat, lon } = subsolarPoint(when);
  return latLonToVector3(lat, lon, 1);
}

/**
 * The 24 hour meridians, as longitudes.
 *
 * One line per hour of the day: this is what makes the sphere read as time
 * zones rather than an abstract grid. Real zone borders follow politics and
 * coastlines, and drawing those would need a boundary dataset for very little
 * gain — the honest version is the solar hour lines.
 */
export function hourMeridians(): number[] {
  return Array.from({ length: 24 }, (_, i) => -180 + i * 15);
}

/** Local solar time at a longitude, in hours (0–24), for the given moment. */
export function solarHourAt(lon: number, when: Date = new Date()): number {
  const utcHours =
    when.getUTCHours() + when.getUTCMinutes() / 60 + when.getUTCSeconds() / 3600;
  const local = utcHours + lon / 15;
  return ((local % 24) + 24) % 24;
}
