// ============================================================
// Keeps the calendar colour system honest against the live design tokens.
// Reads src/index.css exactly as shipped (via node:fs — vitest's CSS pipeline
// hands `?raw` back as an empty string, so the import route is a silent
// no-op here), resolves every
// theme-aware `hsl(var(--cal-…))` colour in BOTH themes, and asserts the
// WCAG 2.1 AA floor for how each colour is used:
//   • event-type / federation / circuit colours are chip TEXT → 4.5:1
//   • entity + surface hex are dots, spines and tints (non-text) → 3:1
// against both surfaces chips sit on: --background and --card.
// A token that a theme forgets to define resolves to an error here rather
// than to an invisible chip in production.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  WCAG_AA_NON_TEXT,
  WCAG_AA_TEXT,
  contrastRatio,
  hexToRgb,
  hslToRgb,
  parseHslTriplet,
  readThemeTokens,
  resolveColor,
  roundRatio,
  type Rgb,
} from "@/lib/a11y/contrast";
import {
  CIRCUIT_COLOR,
  ENTITY_PALETTE,
  EVENT_TYPE_COLOR,
  FEDERATION_COLOR,
  SURFACE_COLOR,
} from "../colors";

const css = fs.readFileSync(path.resolve(__dirname, "../../../index.css"), "utf8");
const THEMES = readThemeTokens(css);
// Guards the guard: if the file ever moves or the reader regresses, fail loudly
// here instead of passing vacuously on an empty token table below.
if (!Object.keys(THEMES.light).some((k) => k.startsWith("--cal-"))) {
  throw new Error("paletteContrast: no --cal-* tokens read from src/index.css");
}
const SURFACES = ["--background", "--card"] as const;

const TEXT_COLOURS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(EVENT_TYPE_COLOR).map(([k, v]) => [`event:${k}`, v])),
  ...Object.fromEntries(Object.entries(FEDERATION_COLOR).map(([k, v]) => [`federation:${k}`, v])),
  ...Object.fromEntries(Object.entries(CIRCUIT_COLOR).map(([k, v]) => [`circuit:${k}`, v])),
};

function surface(tokens: Record<string, string>, name: (typeof SURFACES)[number]): Rgb {
  return hslToRgb(parseHslTriplet(tokens[name]));
}

describe.each(Object.entries(THEMES))("calendar palette contrast — %s theme", (_theme, tokens) => {
  it("defines every --cal-* token the colour maps reference", () => {
    for (const value of Object.values(TEXT_COLOURS)) {
      expect(() => resolveColor(value, tokens)).not.toThrow();
    }
  });

  it.each(Object.entries(TEXT_COLOURS))("%s clears 4.5:1 as text on --background and --card", (_key, value) => {
    const colour = resolveColor(value, tokens);
    for (const name of SURFACES) {
      const ratio = roundRatio(contrastRatio(colour, surface(tokens, name)));
      expect(ratio, `${value} on ${name}`).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    }
  });

  it.each([...ENTITY_PALETTE])("entity colour %s clears 3:1 (non-text) on --background and --card", (hex) => {
    const colour = hexToRgb(hex);
    for (const name of SURFACES) {
      const ratio = roundRatio(contrastRatio(colour, surface(tokens, name)));
      expect(ratio, `${hex} on ${name}`).toBeGreaterThanOrEqual(WCAG_AA_NON_TEXT);
    }
  });

  it.each(Object.entries(SURFACE_COLOR))("court surface %s (%s) clears 3:1 (non-text) on --background and --card", (_court, hex) => {
    const colour = hexToRgb(hex);
    for (const name of SURFACES) {
      const ratio = roundRatio(contrastRatio(colour, surface(tokens, name)));
      expect(ratio, `${hex} on ${name}`).toBeGreaterThanOrEqual(WCAG_AA_NON_TEXT);
    }
  });
});

describe("calendar palette — theme parity", () => {
  it("every --cal-* token declared for light is explicitly re-tuned for dark", () => {
    // readThemeTokens lets .dark inherit light values; an inherited calendar
    // token means someone added a hue to :root and forgot the dark tuning.
    const darkOnly = readThemeTokens(css.slice(css.indexOf(".dark")));
    const lightCal = Object.keys(THEMES.light).filter((k) => k.startsWith("--cal-"));
    const missing = lightCal.filter((k) => darkOnly.dark[k] === undefined || darkOnly.dark[k] === THEMES.light[k]);
    expect(missing).toEqual([]);
  });
});
