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
