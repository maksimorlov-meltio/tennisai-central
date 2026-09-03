// Grid clustering for the map.
//
// The map was built for 26 tournaments and now has more than three thousand.
// The count on a cluster is a claim about the world, so these pin down that it
// is never wrong: every point lands in exactly one cluster, nothing is
// invented, and nothing is silently dropped except points that genuinely have
// nowhere to go.

import { describe, it, expect } from "vitest";
import {
  cellSizeForZoom,
  clusterByGrid,
  clusterForZoom,
  normaliseLongitude,
  plottableCount,
} from "../cluster";

const at = (id: string, latitude: number, longitude: number) => ({ id, latitude, longitude });

describe("clusterByGrid", () => {
  it("groups points that share a cell", () => {
    const clusters = clusterByGrid([at("a", 51.5, -0.1), at("b", 51.6, -0.2)], 10);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].items.map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  it("keeps points in different cells apart", () => {
    const clusters = clusterByGrid([at("london", 51.5, -0.1), at("sydney", -33.9, 151.2)], 10);
    expect(clusters).toHaveLength(2);
  });

  it("never loses or duplicates a point", () => {
    // The count on a cluster circle is a promise. This is that promise.
    const points = Array.from({ length: 500 }, (_, i) =>
      at(`p${i}`, (i % 170) - 85, ((i * 7) % 360) - 180),
    );

    const clusters = clusterByGrid(points, 12);
    const ids = clusters.flatMap((c) => c.items.map((i) => i.id));

    expect(ids).toHaveLength(points.length);
    expect(new Set(ids).size).toBe(points.length);
  });

  it("puts the circle over its own points, not the corner of a cell", () => {
    const clusters = clusterByGrid([at("a", 10, 20), at("b", 20, 40)], 90);
    expect(clusters[0].latitude).toBeCloseTo(15);
    expect(clusters[0].longitude).toBeCloseTo(30);
  });

  it("drops points with no usable coordinates rather than placing them at 0,0", () => {
    // A tournament floating off West Africa is worse than one absent.
    const clusters = clusterByGrid(
      [
        at("good", 40, -3),
        { id: "missing", latitude: null, longitude: null },
        { id: "partial", latitude: 40, longitude: undefined },
        { id: "nonsense", latitude: Number.NaN, longitude: 5 },
        { id: "impossible", latitude: 480, longitude: 5 },
      ],
      10,
    );

    expect(clusters.flatMap((c) => c.items.map((i) => i.id))).toEqual(["good"]);
  });

  it("puts a wrapped longitude beside its true neighbour", () => {
    // A feed reporting 190° means 170°W, next to 179°W — not a lone cell off
    // the edge of the world.
    const clusters = clusterByGrid([at("a", 0, 190), at("b", 0, -175)], 30);
    expect(clusters).toHaveLength(1);
  });

  it("orders smallest first so the busiest circles paint on top", () => {
    const clusters = clusterByGrid(
      [at("a", 0, 0), at("b", 1, 1), at("c", 80, 80)],
      30,
    );
    const sizes = clusters.map((c) => c.items.length);
    expect(sizes).toEqual([...sizes].sort((x, y) => x - y));
  });

  it("gives each cluster a key that changes when its contents do", () => {
    // A stale React key keeps a popup open for a pin a filter has removed.
    const [before] = clusterByGrid([at("a", 0, 0), at("b", 1, 1)], 30);
    const [after] = clusterByGrid([at("a", 0, 0)], 30);
    expect(before.id).not.toBe(after.id);
  });

  it("refuses a cell size that would loop forever", () => {
    expect(() => clusterByGrid([at("a", 0, 0)], 0)).toThrow(/positive/);
  });
});

describe("cellSizeForZoom", () => {
  it("shrinks as you zoom in, so clusters break apart", () => {
    expect(cellSizeForZoom(2)).toBeGreaterThan(cellSizeForZoom(6));
    expect(cellSizeForZoom(6)).toBeGreaterThan(cellSizeForZoom(12));
  });

  it("leaves separate cities separate once zoomed in", () => {
    // London and Paris are ~340 km apart and must not share a pin at city zoom.
    const clusters = clusterForZoom([at("london", 51.5, -0.13), at("paris", 48.86, 2.35)], 9);
    expect(clusters).toHaveLength(2);
  });

  it("collapses a continent into few circles when zoomed out", () => {
    const european = Array.from({ length: 60 }, (_, i) =>
      at(`e${i}`, 45 + (i % 8) * 0.4, 5 + (i % 7) * 0.4),
    );
    expect(clusterForZoom(european, 3).length).toBeLessThan(5);
  });
});

describe("normaliseLongitude", () => {
  it("wraps into -180..180", () => {
    expect(normaliseLongitude(190)).toBeCloseTo(-170);
    expect(normaliseLongitude(-190)).toBeCloseTo(170);
    expect(normaliseLongitude(45)).toBeCloseTo(45);
  });

  it("treats the two ends of the date line as one meridian", () => {
    expect(normaliseLongitude(-180)).toBe(normaliseLongitude(180));
  });
});

describe("plottableCount", () => {
  it("counts only what can actually be drawn", () => {
    expect(
      plottableCount([
        at("a", 1, 2),
        { id: "b", latitude: null, longitude: 3 },
        { id: "c", latitude: 4, longitude: 5 },
      ]),
    ).toBe(2);
  });
});
