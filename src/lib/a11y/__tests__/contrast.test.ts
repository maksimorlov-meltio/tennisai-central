import { describe, expect, it } from "vitest";
import {
  WCAG_AA_LARGE_TEXT,
  WCAG_AA_NON_TEXT,
  WCAG_AA_TEXT,
  composite,
  contrastRatio,
  hexToRgb,
  hslToRgb,
  meetsAA,
  parseColor,
  parseHslTriplet,
  readThemeTokens,
  relativeLuminance,
  resolveColor,
  rgbToHex,
  roundRatio,
} from "../contrast";

describe("parseHslTriplet", () => {
  it("reads the shadcn token format, including decimals", () => {
    expect(parseHslTriplet("146 24% 33%")).toEqual({ h: 146, s: 24, l: 33 });
    expect(parseHslTriplet("16.3 40.7% 46%")).toEqual({ h: 16.3, s: 40.7, l: 46 });
    expect(parseHslTriplet("  0 0% 100%  ")).toEqual({ h: 0, s: 0, l: 100 });
  });

  it("accepts comma-separated and `deg` variants", () => {
    expect(parseHslTriplet("146, 24%, 33%")).toEqual({ h: 146, s: 24, l: 33 });
    expect(parseHslTriplet("146deg 24% 33%")).toEqual({ h: 146, s: 24, l: 33 });
  });

  it("rejects anything that is not a triplet", () => {
    expect(() => parseHslTriplet("#40684f")).toThrow(/Not an HSL triplet/);
    expect(() => parseHslTriplet("146 24 33")).toThrow();
  });
});

describe("hslToRgb", () => {
  it("maps the primaries and neutrals exactly", () => {
    expect(hslToRgb({ h: 0, s: 0, l: 100 })).toEqual({ r: 255, g: 255, b: 255 });
    expect(hslToRgb({ h: 0, s: 0, l: 0 })).toEqual({ r: 0, g: 0, b: 0 });
    expect(hslToRgb({ h: 0, s: 100, l: 50 })).toEqual({ r: 255, g: 0, b: 0 });
    expect(hslToRgb({ h: 120, s: 100, l: 25 })).toEqual({ r: 0, g: 128, b: 0 });
    expect(hslToRgb({ h: 240, s: 100, l: 50 })).toEqual({ r: 0, g: 0, b: 255 });
  });

  it("matches the hex comments in index.css for a calendar token", () => {
    // --cal-event-training: 210 29% 42%  /* #4c6b8a */
    expect(rgbToHex(hslToRgb({ h: 210, s: 29, l: 42 }))).toBe("#4c6b8a");
  });

  it("wraps hue outside 0–360", () => {
    expect(hslToRgb({ h: 360, s: 100, l: 50 })).toEqual({ r: 255, g: 0, b: 0 });
    expect(hslToRgb({ h: -120, s: 100, l: 50 })).toEqual({ r: 0, g: 0, b: 255 });
  });
});

describe("hexToRgb / rgbToHex", () => {
  it("parses long and short hex, with or without #", () => {
    expect(hexToRgb("#4c6b8a")).toEqual({ r: 76, g: 107, b: 138 });
    expect(hexToRgb("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb("4C6B8A")).toEqual({ r: 76, g: 107, b: 138 });
  });

  it("rejects malformed hex", () => {
    expect(() => hexToRgb("#12345")).toThrow(/Not a hex colour/);
    expect(() => hexToRgb("#gggggg")).toThrow();
  });

  it("round-trips", () => {
    expect(rgbToHex(hexToRgb("#a85778"))).toBe("#a85778");
  });
});

describe("parseColor", () => {
  it("accepts every notation the codebase writes", () => {
    expect(parseColor("#4c6b8a")).toEqual({ r: 76, g: 107, b: 138 });
    expect(parseColor("rgb(76, 107, 138)")).toEqual({ r: 76, g: 107, b: 138 });
    expect(parseColor("hsl(210 29% 42%)")).toEqual({ r: 76, g: 107, b: 138 });
    expect(parseColor("hsl(210, 29%, 42%)")).toEqual({ r: 76, g: 107, b: 138 });
    expect(parseColor("210 29% 42%")).toEqual({ r: 76, g: 107, b: 138 });
  });
});

describe("relativeLuminance", () => {
  it("is 1 for white and 0 for black", () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 6);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
  });

  it("matches the published value for mid grey", () => {
    // #808080 → 0.2159 (WCAG worked example)
    expect(relativeLuminance({ r: 128, g: 128, b: 128 })).toBeCloseTo(0.2159, 3);
  });
});

describe("contrastRatio", () => {
  it("is 21:1 for black on white and 1:1 for identical colours", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 4);
    expect(contrastRatio("#4c6b8a", "#4c6b8a")).toBe(1);
  });

  it("is order-independent", () => {
    expect(contrastRatio("#4c6b8a", "#f9f7f4")).toBeCloseTo(contrastRatio("#f9f7f4", "#4c6b8a"), 10);
  });

  it("reproduces the well-known #777-on-white near miss", () => {
    const ratio = contrastRatio("#777777", "#ffffff");
    expect(roundRatio(ratio)).toBe(4.48);
    expect(meetsAA(ratio)).toBe(false);
  });

  it("accepts Rgb objects and strings interchangeably", () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, "#fff")).toBeCloseTo(21, 4);
  });
});

describe("meetsAA", () => {
  it("uses 4.5:1 for text, 3:1 for large text and non-text UI", () => {
    expect(WCAG_AA_TEXT).toBe(4.5);
    expect(WCAG_AA_LARGE_TEXT).toBe(3);
    expect(WCAG_AA_NON_TEXT).toBe(3);
    expect(meetsAA(4.5)).toBe(true);
    expect(meetsAA(4.49)).toBe(false);
    expect(meetsAA(3, { large: true })).toBe(true);
    expect(meetsAA(2.99, { large: true })).toBe(false);
    expect(meetsAA(3, { nonText: true })).toBe(true);
    expect(meetsAA(2.99, { nonText: true })).toBe(false);
  });
});

describe("composite", () => {
  const fg = { r: 64, g: 104, b: 80 };
  const bg = { r: 250, g: 248, b: 245 };

  it("returns the foreground at alpha 1 and the background at alpha 0", () => {
    expect(composite(fg, bg, 1)).toEqual(fg);
    expect(composite(fg, bg, 0)).toEqual(bg);
  });

  it("mixes linearly in sRGB (what bg-primary/10 paints)", () => {
    expect(composite(fg, bg, 0.5)).toEqual({ r: 157, g: 176, b: 163 });
    const tint = composite(fg, bg, 0.1);
    expect(tint).toEqual({ r: 231, g: 234, b: 229 });
  });

  it("clamps alpha to 0–1", () => {
    expect(composite(fg, bg, 2)).toEqual(fg);
    expect(composite(fg, bg, -1)).toEqual(bg);
  });
});

describe("readThemeTokens", () => {
  const css = `
    /* header comment with --fake: 0 0% 0%; inside */
    @layer base {
      :root {
        --background: 40 33% 97%;        /* warm paper */
        --primary: 146 24% 33%;
        --radius: 0rem;
      }
      .dark {
        --background: 0 0% 7%;
        --primary: 146 22% 46%;
      }
    }
    @layer base {
      :root {
        --safe-top: env(safe-area-inset-top, 0px);
      }
    }
  `;

  it("collects every :root block into light and overlays .dark on top", () => {
    const { light, dark } = readThemeTokens(css);
    expect(light["--background"]).toBe("40 33% 97%");
    expect(light["--primary"]).toBe("146 24% 33%");
    expect(light["--safe-top"]).toBe("env(safe-area-inset-top, 0px)");
    expect(dark["--background"]).toBe("0 0% 7%");
    expect(dark["--primary"]).toBe("146 22% 46%");
  });

  it("lets the dark theme inherit tokens it does not redefine", () => {
    const { dark } = readThemeTokens(css);
    expect(dark["--radius"]).toBe("0rem");
    expect(dark["--safe-top"]).toBe("env(safe-area-inset-top, 0px)");
  });

  it("ignores declarations inside comments", () => {
    const { light } = readThemeTokens(css);
    expect(light["--fake"]).toBeUndefined();
  });
});

describe("resolveColor", () => {
  const tokens = { "--primary": "146 24% 33%", "--background": "40 33% 97%" };

  it("resolves hsl(var(--token)) against the theme", () => {
    expect(resolveColor("hsl(var(--primary))", tokens)).toEqual(hslToRgb({ h: 146, s: 24, l: 33 }));
  });

  it("passes plain colours straight through", () => {
    expect(resolveColor("#4c6b8a", tokens)).toEqual({ r: 76, g: 107, b: 138 });
  });

  it("throws on a token the theme does not define", () => {
    expect(() => resolveColor("hsl(var(--cal-missing))", tokens)).toThrow(/not defined/);
  });
});
