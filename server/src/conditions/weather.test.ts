import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  selectSource,
  readDay,
  getWeather,
  clearWeatherCache,
  FORECAST_HORIZON_DAYS,
  WeatherUnavailable,
} from "./weather";

const TODAY = new Date("2026-08-09T12:00:00.000Z");

describe("selectSource — which source may honestly answer", () => {
  it("uses observed history for a date in the past", () => {
    expect(selectSource(new Date("2026-08-01"), TODAY)).toBe("observed");
  });

  it("uses a forecast for today and inside the horizon", () => {
    expect(selectSource(new Date("2026-08-09"), TODAY)).toBe("forecast");
    expect(selectSource(new Date("2026-08-20"), TODAY)).toBe("forecast");
  });

  it("switches to typical the day AFTER the forecast horizon ends", () => {
    const lastForecastDay = new Date(TODAY.getTime() + FORECAST_HORIZON_DAYS * 86_400_000);
    const dayAfter = new Date(TODAY.getTime() + (FORECAST_HORIZON_DAYS + 1) * 86_400_000);
    expect(selectSource(lastForecastDay, TODAY)).toBe("forecast");
    expect(selectSource(dayAfter, TODAY)).toBe("typical");
  });

  it("never claims a forecast for a tournament months away", () => {
    expect(selectSource(new Date("2027-01-19"), TODAY)).toBe("typical");
  });
});

describe("readDay", () => {
  const payload = {
    daily: { temperature_2m_max: [31], temperature_2m_min: [19] },
    hourly: {
      time: [
        "2026-08-09T04:00", // night — must be ignored
        "2026-08-09T12:00",
        "2026-08-09T15:00",
        "2026-08-09T23:00", // night — must be ignored
      ],
      temperature_2m: [18, 28, 30, 20],
      relative_humidity_2m: [90, 55, 45, 85],
    },
  };

  it("averages the playing hours, not the whole day", () => {
    const r = readDay(payload, 0)!;
    expect(r.temperatureC).toBe(29); // (28 + 30) / 2 — the 4am and 11pm rows excluded
    expect(r.humidityPct).toBe(50); // (55 + 45) / 2
    expect(r.temperatureMaxC).toBe(31);
  });

  it("falls back to the daily midpoint when there are no hourly rows", () => {
    const r = readDay({ daily: payload.daily }, 0)!;
    expect(r.temperatureC).toBe(25); // (31 + 19) / 2
    expect(r.humidityPct).toBe(50); // reference default, documented in the source
  });

  it("returns null when the response has no usable day", () => {
    expect(readDay({}, 0)).toBeNull();
    expect(readDay({ daily: { temperature_2m_max: [] } }, 0)).toBeNull();
  });
});

describe("getWeather", () => {
  beforeEach(() => clearWeatherCache());
  afterEach(() => vi.unstubAllGlobals());

  it("calls the forecast endpoint for a near date and caches the answer", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      urls.push(url);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            daily: { temperature_2m_max: [30], temperature_2m_min: [20] },
            hourly: {
              time: ["2026-08-12T14:00"],
              temperature_2m: [27],
              relative_humidity_2m: [60],
            },
          }),
      } as Response);
    });

    const args = { latitude: 40.7, longitude: -74, date: new Date("2026-08-12"), now: TODAY };
    const first = await getWeather(args);
    const second = await getWeather(args);

    expect(first.kind).toBe("forecast");
    expect(first.temperatureC).toBe(27);
    expect(first.humidityPct).toBe(60);
    expect(urls[0]).toContain("api.open-meteo.com/v1/forecast");
    expect(urls).toHaveLength(1); // the second call was served from cache
    expect(second).toEqual(first);
  });

  it("averages several past years for a far-off date, and says so", async () => {
    const urls: string[] = [];
    let year = 0;
    vi.stubGlobal("fetch", (url: string) => {
      urls.push(url);
      year += 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            // 20, 22, 24, 26, 28 across the five years → mean 24
            daily: { temperature_2m_max: [30], temperature_2m_min: [10] },
            hourly: {
              time: ["2020-01-19T14:00"],
              temperature_2m: [18 + year * 2],
              relative_humidity_2m: [50],
            },
          }),
      } as Response);
    });

    const reading = await getWeather({
      latitude: -37.8,
      longitude: 145,
      date: new Date("2027-01-19"),
      now: TODAY,
    });

    expect(reading.kind).toBe("typical");
    expect(reading.basedOnYears).toBe(5);
    expect(reading.temperatureC).toBe(24);
    expect(reading.source).toMatch(/average of the same date across 5 previous years/);
    expect(urls.every((u) => u.includes("archive-api"))).toBe(true);
  });

  it("throws rather than inventing a number when the provider fails", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve({ ok: false, status: 503 } as Response));
    await expect(
      getWeather({ latitude: 0, longitude: 0, date: new Date("2026-08-12"), now: TODAY }),
    ).rejects.toBeInstanceOf(WeatherUnavailable);
  });
});
