// ============================================================
// Keeps the type scale and spacing rhythm honest in CI.
//
// The app has ONE type scale — Tailwind's named steps (text-xs 12 / sm 14 /
// base 16 / lg 18 / xl 20 / 2xl 24 / 3xl 30 …) — plus exactly two dense-grid
// exceptions, `text-[10px]` and `text-[11px]`, for calendar cells, badges and
// legends where the 7-column month grid genuinely cannot afford 12px on
// desktop (docs/design/tokens.md, "Type scale"). Anything else written as an
// arbitrary `text-[…]` length is a drift from the scale and fails here, as
// does anything under 10px — at that size the glyphs are decoration, not text.
//
// Spacing follows the same rule: the 4px grid via Tailwind's named steps.
// The only arbitrary spacing tolerated is a 1px hairline.
//
// Both walks read the source tree via node:fs so the check is over what is
// shipped, not over what happens to be imported by a test.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../../..");

/** Arbitrary font sizes the scale tolerates (see header). */
const ALLOWED_ARBITRARY_TEXT = new Set(["10px", "11px"]);
/** Nothing rendered as text may be smaller than this. */
const MIN_FONT_PX = 10;
/** Arbitrary spacing values tolerated: hairlines only. */
const ALLOWED_ARBITRARY_SPACING = new Set(["1px"]);

/**
 * Files exempt from the font-size rule, each with the reason. Keep this list
 * short and every entry justified — it is the escape hatch, not the rule.
 */
const FONT_SIZE_EXEMPT: Record<string, string> = {
  // shadcn's react-day-picker wrapper ships `text-[0.8rem]` on its weekday
  // header. No component imports it today; restyling an unused vendored
  // primitive is not worth a diff against upstream.
  "components/ui/calendar.tsx": "unused shadcn primitive, upstream class string",
};

const TEXT_RE = /\btext-\[(\d+(?:\.\d+)?)(px|rem|em)\]/g;
const SPACING_RE =
  /\b(?:-?(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y))-\[(\d+(?:\.\d+)?)(px|rem|em)\]/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "test") continue;
      walk(full, out);
    } else if (/\.(tsx|ts)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const toPx = (value: number, unit: string): number => (unit === "px" ? value : value * 16);
const rel = (file: string) => path.relative(SRC, file).split(path.sep).join("/");

const FILES = walk(SRC);

describe("type scale", () => {
  it("scans the source tree", () => {
    // Guards the guard: an empty walk would make every assertion below vacuous.
    expect(FILES.length).toBeGreaterThan(50);
  });

  it("uses only Tailwind's named steps plus the 10px/11px dense-grid exceptions", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const key = rel(file);
      if (FONT_SIZE_EXEMPT[key]) continue;
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(TEXT_RE)) {
        const literal = `${m[1]}${m[2]}`;
        if (!ALLOWED_ARBITRARY_TEXT.has(literal)) {
          const line = src.slice(0, m.index).split("\n").length;
          offenders.push(`${key}:${line} text-[${literal}]`);
        }
      }
    }
    expect(offenders, "off-scale font sizes (use text-xs/sm/base/lg/xl/2xl/3xl)").toEqual([]);
  });

  it(`never renders text below ${MIN_FONT_PX}px`, () => {
    const tooSmall: string[] = [];
    for (const file of FILES) {
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(TEXT_RE)) {
        if (toPx(Number(m[1]), m[2]) < MIN_FONT_PX) {
          const line = src.slice(0, m.index).split("\n").length;
          tooSmall.push(`${rel(file)}:${line} text-[${m[1]}${m[2]}]`);
        }
      }
    }
    expect(tooSmall).toEqual([]);
  });

  it("keeps every exemption pointing at a file that still exists", () => {
    for (const key of Object.keys(FONT_SIZE_EXEMPT)) {
      expect(fs.existsSync(path.join(SRC, key)), `${key} was exempted but is gone — drop the entry`).toBe(true);
    }
  });
});

describe("spacing rhythm", () => {
  it("stays on the 4px grid — arbitrary padding/margin/gap only as 1px hairlines", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(SPACING_RE)) {
        const literal = `${m[1]}${m[2]}`;
        if (!ALLOWED_ARBITRARY_SPACING.has(literal)) {
          const line = src.slice(0, m.index).split("\n").length;
          offenders.push(`${rel(file)}:${line} ${m[0]}`);
        }
      }
    }
    expect(offenders, "arbitrary spacing (use the named 0.5/1/1.5/2/3/4/5/6 steps)").toEqual([]);
  });
});
