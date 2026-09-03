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
