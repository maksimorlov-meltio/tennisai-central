// Viewport culling for the tournament map.
//
// This is the fix that made the map usable: without it every one of ~3,300
// tournaments became a marker whatever the map was showing. The bug it is most
// likely to reintroduce is the antimeridian one — Leaflet reports a viewport
// over the Pacific with west > east, and the naive comparison matches nothing,
// so the map goes blank rather than merely wrong. That is the case worth
// pinning down in an assertion.

import { describe, it, expect } from "vitest";
import { padBounds, withinBounds, crossesAntimeridian, type Bounds } from "../cluster";

const pin = (id: string, latitude: number, longitude: number) => ({ id, latitude, longitude });

/** Roughly western Europe. */
const EUROPE: Bounds = { north: 55, south: 40, east: 20, west: -10 };

describe("crossesAntimeridian", () => {
  it("is false for an ordinary box", () => {
    expect(crossesAntimeridian(EUROPE)).toBe(false);
  });

  it("is true when the box wraps the date line", () => {
    expect(crossesAntimeridian({ north: 10, south: -10, east: -170, west: 170 })).toBe(true);
  });
});

describe("withinBounds", () => {
  it("keeps what is inside and drops what is outside", () => {
    const items = [
      pin("madrid", 40.4, -3.7),
      pin("paris", 48.9, 2.4),
      pin("sydney", -33.9, 151.2),
      pin("tokyo", 35.7, 139.7),
    ];
    expect(withinBounds(items, EUROPE).map((i) => i.id)).toEqual(["madrid", "paris"]);
  });

  it("returns everything when there is no viewport yet", () => {
    // First render, before the map has reported its bounds: showing all pins
    // is right, showing none would flash an empty map.
    const items = [pin("a", 0, 0), pin("b", 50, 50)];
    expect(withinBounds(items, null)).toHaveLength(2);
  });

  it("drops pins with no usable coordinates rather than placing them at 0,0", () => {
    const items = [
      pin("ok", 45, 5),
      { id: "no-lat", latitude: null, longitude: 5 },
      { id: "no-lon", latitude: 45, longitude: undefined },
      { id: "nan", latitude: Number.NaN, longitude: 5 },
    ];
    expect(withinBounds(items, EUROPE).map((i) => i.id)).toEqual(["ok"]);
  });

  it("keeps pins across the date line instead of blanking the Pacific", () => {
    // west=170, east=-170: the box spans the 180th meridian. Fiji (178) and
    // Samoa (-172) are both inside it; London is not.
    const pacific: Bounds = { north: 10, south: -30, east: -170, west: 170 };
    const items = [pin("fiji", -18, 178), pin("samoa", -13, -172), pin("london", 51, 0)];
    expect(withinBounds(items, pacific).map((i) => i.id).sort()).toEqual(["fiji", "samoa"]);
  });

  it("normalises a longitude the feed reported outside -180..180", () => {
    // 190° is really -170°, which is inside a box spanning the date line.
    const pacific: Bounds = { north: 10, south: -30, east: -160, west: 170 };
    expect(withinBounds([pin("wrapped", 0, 190)], pacific)).toHaveLength(1);
  });

  it("includes points exactly on the edge", () => {
    expect(withinBounds([pin("corner", 55, 20)], EUROPE)).toHaveLength(1);
  });
});

describe("padBounds", () => {
  it("grows the box so pins do not pop in at the edge while panning", () => {
    const padded = padBounds(EUROPE, 0.5);
    expect(padded.north).toBeGreaterThan(EUROPE.north);
    expect(padded.south).toBeLessThan(EUROPE.south);
    expect(padded.east).toBeGreaterThan(EUROPE.east);
    expect(padded.west).toBeLessThan(EUROPE.west);
  });

  it("admits a pin just outside the raw viewport", () => {
    // 15° span, padded by a third → ~5° of slack each side.
    const justOutside = pin("just-north", 57, 5);
    expect(withinBounds([justOutside], EUROPE)).toHaveLength(0);
    expect(withinBounds([justOutside], padBounds(EUROPE, 0.35))).toHaveLength(1);
  });

  it("never pushes latitude off the actual planet", () => {
    const polar = padBounds({ north: 85, south: -85, east: 180, west: -180 }, 1);
    expect(polar.north).toBeLessThanOrEqual(90);
    expect(polar.south).toBeGreaterThanOrEqual(-90);
  });

  it("keeps longitudes in -180..180 after padding past the edge", () => {
    const padded = padBounds({ north: 10, south: -10, east: 175, west: 160 }, 1);
    expect(padded.east).toBeGreaterThanOrEqual(-180);
    expect(padded.east).toBeLessThanOrEqual(180);
    expect(padded.west).toBeGreaterThanOrEqual(-180);
    expect(padded.west).toBeLessThanOrEqual(180);
  });
});
