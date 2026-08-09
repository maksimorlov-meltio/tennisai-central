import { describe, it, expect } from "vitest";
import { haversineKm, formatDistanceKm } from "../distance";

const PARIS = { lat: 48.8566, lng: 2.3522 };
const LONDON = { lat: 51.5074, lng: -0.1278 };
const BERLIN = { lat: 52.5200, lng: 13.4050 };
const MUNICH = { lat: 48.1351, lng: 11.5820 };
const NEW_YORK = { lat: 40.7128, lng: -74.0060 };
const LOS_ANGELES = { lat: 34.0522, lng: -118.2437 };

describe("haversineKm", () => {
  it("matches the well-known Paris ↔ London great-circle distance (~344 km)", () => {
    expect(haversineKm(PARIS, LONDON)).toBeGreaterThan(330);
    expect(haversineKm(PARIS, LONDON)).toBeLessThan(360);
  });

  it("matches the well-known Berlin ↔ Munich great-circle distance (~504 km)", () => {
    expect(haversineKm(BERLIN, MUNICH)).toBeGreaterThan(480);
    expect(haversineKm(BERLIN, MUNICH)).toBeLessThan(525);
  });

  it("matches the well-known New York ↔ Los Angeles great-circle distance (~3936 km)", () => {
    expect(haversineKm(NEW_YORK, LOS_ANGELES)).toBeGreaterThan(3850);
    expect(haversineKm(NEW_YORK, LOS_ANGELES)).toBeLessThan(4000);
  });

  it("is zero for identical points", () => {
    expect(haversineKm(PARIS, PARIS)).toBeCloseTo(0, 6);
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBeCloseTo(0, 6);
  });

  it("is symmetric — order of points doesn't matter", () => {
    const forward = haversineKm(PARIS, LONDON);
    const backward = haversineKm(LONDON, PARIS);
    expect(forward).toBeCloseTo(backward, 6);
  });

  it("handles antipodal-ish / cross-hemisphere pairs without NaN", () => {
    const d = haversineKm({ lat: 89, lng: 0 }, { lat: -89, lng: 180 });
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(19000);
  });
});

describe("formatDistanceKm", () => {
  it("formats small distances without a thousands separator", () => {
    expect(formatDistanceKm(12)).toBe("12 km");
    expect(formatDistanceKm(0)).toBe("0 km");
  });

  it("formats large distances with a thousands separator", () => {
    expect(formatDistanceKm(1240)).toBe("1,240 km");
    expect(formatDistanceKm(9999)).toBe("9,999 km");
  });

  it("rounds to the nearest whole kilometre", () => {
    expect(formatDistanceKm(12.4)).toBe("12 km");
    expect(formatDistanceKm(12.6)).toBe("13 km");
  });
});
