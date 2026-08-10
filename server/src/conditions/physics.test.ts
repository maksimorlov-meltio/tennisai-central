import { describe, it, expect } from "vitest";
import {
  airDensity,
  computeConditions,
  pressureAtAltitude,
  saturationVapourPressure,
  REFERENCE,
} from "./physics";

// These check the physics against known values, not against themselves. If the
// numbers here drift, the model is wrong — not the test.

describe("airDensity", () => {
  it("matches the standard sea-level value for dry ISA conditions", () => {
    // ICAO standard atmosphere: 15°C, 1013.25 hPa, dry → 1.225 kg/m³.
    expect(airDensity(15, 0, 0)).toBeCloseTo(1.225, 2);
  });

  it("falls with altitude", () => {
    const sea = airDensity(20, 0, 50);
    const mile = airDensity(20, 1600, 50); // ~Denver
    const bogota = airDensity(20, 2640, 50);
    expect(mile).toBeLessThan(sea);
    expect(bogota).toBeLessThan(mile);
    // Bogotá sits around three quarters of sea-level density.
    expect(bogota / sea).toBeCloseTo(0.73, 1);
  });

  it("falls as air warms", () => {
    expect(airDensity(35, 0, 50)).toBeLessThan(airDensity(5, 0, 50));
  });

  it("falls as humidity RISES — humid air is lighter, not heavier", () => {
    // The counter-intuitive one, and the reason it is computed rather than
    // guessed: water vapour displaces heavier nitrogen and oxygen.
    expect(airDensity(30, 0, 90)).toBeLessThan(airDensity(30, 0, 10));
  });
});

describe("pressureAtAltitude", () => {
  it("is sea-level standard at zero", () => {
    expect(pressureAtAltitude(0)).toBeCloseTo(1013.25, 1);
  });

  it("is about 795 hPa at 2000m", () => {
    expect(pressureAtAltitude(2000)).toBeGreaterThan(780);
    expect(pressureAtAltitude(2000)).toBeLessThan(805);
  });
});

describe("saturationVapourPressure", () => {
  it("is about 23.4 hPa at 20°C", () => {
    expect(saturationVapourPressure(20)).toBeCloseTo(23.4, 0);
  });
});

describe("computeConditions", () => {
  it("calls the reference conditions neutral, by definition", () => {
    const c = computeConditions({
      temperatureC: REFERENCE.temperatureC,
      altitudeM: REFERENCE.altitudeM,
      humidityPct: REFERENCE.humidityPct,
    });
    expect(c.densityVsReferencePct).toBe(0);
    expect(c.speed).toBe("neutral");
    expect(c.bounce).toBe("neutral");
    expect(c.drivers).toEqual([]);
  });

  it("reads high altitude as fast and high-bouncing", () => {
    const c = computeConditions({ temperatureC: 20, altitudeM: 2640, humidityPct: 50 });
    expect(c.speed).toBe("faster");
    expect(c.bounce).toBe("higher");
    expect(c.densityVsReferencePct).toBeLessThan(-20);
    expect(c.drivers[0]).toMatch(/altitude/i);
  });

  it("reads a cold sea-level day as slow and low", () => {
    const c = computeConditions({ temperatureC: 5, altitudeM: 0, humidityPct: 60 });
    expect(c.speed).toBe("slower");
    expect(c.bounce).toBe("lower");
    expect(c.drivers.join(" ")).toMatch(/cold/i);
  });

  it("warns about balls taking on water when it is very humid", () => {
    const c = computeConditions({ temperatureC: 30, altitudeM: 0, humidityPct: 90 });
    expect(c.drivers.join(" ")).toMatch(/moisture|heavy/i);
  });

  it("is deterministic — the same input always gives the same answer", () => {
    const input = { temperatureC: 26.4, altitudeM: 340, humidityPct: 71 };
    expect(computeConditions(input)).toEqual(computeConditions(input));
  });

  it("does not crash on absurd input", () => {
    expect(() => computeConditions({ temperatureC: -40, altitudeM: 0, humidityPct: 0 })).not.toThrow();
    expect(() => computeConditions({ temperatureC: 50, altitudeM: 4000, humidityPct: 100 })).not.toThrow();
  });
});
