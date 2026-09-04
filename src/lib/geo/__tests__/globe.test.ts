// Placing tournaments on the globe.
//
// A pin in the wrong hemisphere looks entirely plausible on a rotating sphere
// and is obvious in an assertion, which is the whole reason this maths lives
// outside the WebGL component.

import { describe, it, expect } from "vitest";
import { GLOBE_RADIUS, latLonToVector3, rotationToFace, toPointCloud } from "../globe";

/** Distance from the centre — every point must sit on the sphere. */
const radiusOf = (v: { x: number; y: number; z: number }) =>
  Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

describe("latLonToVector3", () => {
  it("puts the north pole up and the south pole down", () => {
    expect(latLonToVector3(90, 0).y).toBeCloseTo(GLOBE_RADIUS);
    expect(latLonToVector3(-90, 0).y).toBeCloseTo(-GLOBE_RADIUS);
  });

  it("puts 0°,0° toward the camera, so the globe opens on the Atlantic", () => {
    const origin = latLonToVector3(0, 0);
    expect(origin.z).toBeCloseTo(GLOBE_RADIUS);
    expect(origin.x).toBeCloseTo(0);
    expect(origin.y).toBeCloseTo(0);
  });

  it("sends east positive and west negative", () => {
    expect(latLonToVector3(0, 90).x).toBeCloseTo(GLOBE_RADIUS); // 90°E
    expect(latLonToVector3(0, -90).x).toBeCloseTo(-GLOBE_RADIUS); // 90°W
  });

  it("keeps every point on the sphere", () => {
    const samples = [
      [51.5, -0.13], // London
      [-33.87, 151.21], // Sydney
      [35.68, 139.69], // Tokyo
      [-22.9, -43.17], // Rio
      [0, 180], // date line
    ];
    for (const [lat, lon] of samples) {
      expect(radiusOf(latLonToVector3(lat, lon))).toBeCloseTo(GLOBE_RADIUS, 6);
    }
  });

  it("separates the hemispheres the way an atlas does", () => {
    // Northern above the equator, southern below; a sign error here would put
    // Sydney in Europe and nobody would notice on a spinning ball.
    expect(latLonToVector3(51.5, -0.13).y).toBeGreaterThan(0); // London
    expect(latLonToVector3(-33.87, 151.21).y).toBeLessThan(0); // Sydney
  });

  it("honours a custom radius, for pins sitting proud of the surface", () => {
    expect(radiusOf(latLonToVector3(20, 30, 2))).toBeCloseTo(2, 6);
  });
});

describe("toPointCloud", () => {
  it("returns three numbers per plottable tournament", () => {
    const cloud = toPointCloud([
      { latitude: 10, longitude: 20 },
      { latitude: -5, longitude: 100 },
    ]);
    expect(cloud).toBeInstanceOf(Float32Array);
    expect(cloud.length).toBe(6);
  });

  it("skips anything without usable coordinates instead of defaulting to 0,0", () => {
    const cloud = toPointCloud([
      { latitude: 10, longitude: 20 },
      { latitude: null, longitude: 20 },
      { latitude: 10, longitude: undefined },
      { latitude: Number.NaN, longitude: 20 },
      { latitude: 200, longitude: 20 },
    ]);
    expect(cloud.length).toBe(3);
  });

  it("produces an empty buffer, not a crash, for nothing at all", () => {
    expect(toPointCloud([]).length).toBe(0);
  });

  it("places pins fractionally above the surface so they are not buried", () => {
    const [x, y, z] = Array.from(toPointCloud([{ latitude: 0, longitude: 0 }], 1.05));
    expect(radiusOf({ x, y, z })).toBeCloseTo(1.05, 6);
  });
});

describe("rotationToFace", () => {
  it("turns the globe to bring a coordinate into view", () => {
    const north = rotationToFace(60, 0);
    const south = rotationToFace(-60, 0);
    expect(north.x).toBeGreaterThan(0);
    expect(south.x).toBeLessThan(0);
  });

  it("moves in the opposite direction to longitude, because the globe turns, not the camera", () => {
    expect(rotationToFace(0, 90).y).toBeLessThan(rotationToFace(0, 0).y);
  });
});

// ── Daylight ────────────────────────────────────────────────────────────────
//
// The globe lights itself from where the sun actually is. A sign error here
// puts midnight over Europe at lunchtime, which looks plausible on a dark
// sphere and is unmistakable in an assertion.

import { hourMeridians, solarHourAt, subsolarPoint, sunDirection } from "../globe";

describe("subsolarPoint", () => {
  it("puts the sun over the Greenwich meridian at noon UTC", () => {
    const { lon } = subsolarPoint(new Date("2026-03-20T12:00:00Z"));
    expect(Math.abs(lon)).toBeLessThan(1);
  });

  it("puts it over the date line at midnight UTC", () => {
    const { lon } = subsolarPoint(new Date("2026-03-20T00:00:00Z"));
    expect(Math.abs(Math.abs(lon) - 180)).toBeLessThan(1);
  });

  it("tracks 15 degrees west per hour", () => {
    const noon = subsolarPoint(new Date("2026-03-20T12:00:00Z")).lon;
    const onePm = subsolarPoint(new Date("2026-03-20T13:00:00Z")).lon;
    expect(noon - onePm).toBeCloseTo(15, 1);
  });

  it("sits north of the equator in the northern summer and south in winter", () => {
    // The tilt is the whole reason the terminator is not a straight line.
    expect(subsolarPoint(new Date("2026-06-21T12:00:00Z")).lat).toBeGreaterThan(20);
    expect(subsolarPoint(new Date("2026-12-21T12:00:00Z")).lat).toBeLessThan(-20);
  });

  it("crosses the equator near the equinoxes", () => {
    expect(Math.abs(subsolarPoint(new Date("2026-03-20T12:00:00Z")).lat)).toBeLessThan(2);
    expect(Math.abs(subsolarPoint(new Date("2026-09-22T12:00:00Z")).lat)).toBeLessThan(2);
  });

  it("never leaves the tropics", () => {
    for (let day = 0; day < 365; day += 7) {
      const when = new Date(Date.UTC(2026, 0, 1 + day, 12));
      expect(Math.abs(subsolarPoint(when).lat)).toBeLessThanOrEqual(23.45);
    }
  });

  it("stays within -180..180", () => {
    for (let hour = 0; hour < 24; hour++) {
      const lon = subsolarPoint(new Date(Date.UTC(2026, 5, 1, hour))).lon;
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
    }
  });
});

describe("sunDirection", () => {
  it("is a unit vector, so it can be scaled to place the light", () => {
    const v = sunDirection(new Date("2026-06-21T12:00:00Z"));
    expect(Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)).toBeCloseTo(1, 6);
  });

  it("points at the camera-facing side at noon UTC, where 0,0 sits", () => {
    const v = sunDirection(new Date("2026-03-20T12:00:00Z"));
    expect(v.z).toBeGreaterThan(0.9);
  });
});

describe("hour meridians and solar time", () => {
  it("gives one line per hour of the day", () => {
    const lines = hourMeridians();
    expect(lines).toHaveLength(24);
    expect(lines[1] - lines[0]).toBe(15);
  });

  it("reads midday on the meridian the sun is over", () => {
    const when = new Date("2026-03-20T12:00:00Z");
    expect(solarHourAt(subsolarPoint(when).lon, when)).toBeCloseTo(12, 1);
  });

  it("is twelve hours apart on opposite sides of the world", () => {
    const when = new Date("2026-03-20T09:00:00Z");
    const here = solarHourAt(0, when);
    const there = solarHourAt(180, when);
    expect(Math.abs(((here - there + 24) % 24) - 12)).toBeLessThan(0.01);
  });

  it("always reports an hour inside the day", () => {
    for (const lon of [-180, -90, 0, 90, 180]) {
      const h = solarHourAt(lon, new Date("2026-03-20T23:30:00Z"));
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(24);
    }
  });
});
