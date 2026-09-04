// ============================================================
// TennisAI — WCAG 2.1 contrast helpers
// Pure, framework-free colour maths so the design tokens can be checked in
// CI rather than by eye. Used by the calendar-palette contrast test and by
// the token audit script (scratch). Formulae follow WCAG 2.1 §1.4.3 (text,
// 4.5:1 / large 3:1) and §1.4.11 (non-text UI, 3:1).
// ============================================================

export interface Rgb {
  /** 0–255 */
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  /** Degrees, 0–360 */
  h: number;
  /** Percent, 0–100 */
  s: number;
  /** Percent, 0–100 */
  l: number;
}

/** Minimum ratio for body text (WCAG 2.1 SC 1.4.3, level AA). */
export const WCAG_AA_TEXT = 4.5;
/** Minimum ratio for large text — ≥ 18.66px bold or ≥ 24px regular (SC 1.4.3). */
export const WCAG_AA_LARGE_TEXT = 3;
/** Minimum ratio for UI components and graphical objects (SC 1.4.11). */
export const WCAG_AA_NON_TEXT = 3;

const clamp255 = (n: number) => Math.min(255, Math.max(0, Math.round(n)));

/**
 * Parse the shadcn token format — the bare `h s% l%` triplet that lives in
 * `--primary: 146 24% 33%;`. Decimal components ("16.3 40.7% 46%") are fine.
 */
export function parseHslTriplet(value: string): Hsl {
  const m = value
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)(?:deg)?[\s,]+(\d+(?:\.\d+)?)%[\s,]+(\d+(?:\.\d+)?)%$/);
  if (!m) throw new Error(`Not an HSL triplet: "${value}"`);
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

/** HSL → 8-bit sRGB, rounded the way the browser rasterises `hsl()`. */
export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const sat = s / 100;
  const light = l / 100;
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: clamp255((r + m) * 255), g: clamp255((g + m) * 255), b: clamp255((b + m) * 255) };
}

/** `#rgb` or `#rrggbb` → Rgb. */
export function hexToRgb(hex: string): Rgb {
  const h = hex.trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((ch) => ch + ch).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Not a hex colour: "${hex}"`);
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const to2 = (n: number) => clamp255(n).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/**
 * Parse any colour notation the codebase actually writes: `#rrggbb`,
 * `rgb(r, g, b)`, `hsl(h s% l%)` / `hsl(h, s%, l%)`, or the bare `h s% l%`
 * token triplet. Alpha is deliberately not accepted — composite explicitly
 * with `composite()` so the backdrop is never guessed.
 */
export function parseColor(input: string): Rgb {
  const v = input.trim();
  if (v.startsWith("#")) return hexToRgb(v);
  const rgb = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\)$/i);
  if (rgb) return { r: clamp255(+rgb[1]), g: clamp255(+rgb[2]), b: clamp255(+rgb[3]) };
  const hsl = v.match(/^hsla?\(\s*([^)]+?)\s*\)$/i);
  if (hsl) return hslToRgb(parseHslTriplet(hsl[1]));
  return hslToRgb(parseHslTriplet(v));
}

/** Relative luminance per WCAG 2.1 (sRGB → linear light, Rec. 709 weights). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Contrast ratio (1–21). Order-independent: pass foreground/background either way round. */
export function contrastRatio(a: Rgb | string, b: Rgb | string): number {
  const la = relativeLuminance(typeof a === "string" ? parseColor(a) : a);
  const lb = relativeLuminance(typeof b === "string" ? parseColor(b) : b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Round to the two decimals audit tables are written in. */
export function roundRatio(ratio: number): number {
  return Math.round(ratio * 100) / 100;
}

/**
 * Does the ratio clear WCAG 2.1 AA for the given use?
 * - default: body text, 4.5:1
 * - `large`: large text, 3:1
 * - `nonText`: UI component / graphic, 3:1
 */
export function meetsAA(ratio: number, opts: { large?: boolean; nonText?: boolean } = {}): boolean {
  const floor = opts.large ? WCAG_AA_LARGE_TEXT : opts.nonText ? WCAG_AA_NON_TEXT : WCAG_AA_TEXT;
  return ratio >= floor;
}

/**
 * Alpha-composite `fg` at `alpha` (0–1) over an opaque `bg`, in sRGB — the
 * colour `bg-primary/10` or `color-mix(in srgb, …)` actually paints. Contrast
 * against a translucent tint must be measured against THIS, not the raw tint.
 */
export function composite(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  const a = Math.min(1, Math.max(0, alpha));
  return {
    r: clamp255(fg.r * a + bg.r * (1 - a)),
    g: clamp255(fg.g * a + bg.g * (1 - a)),
    b: clamp255(fg.b * a + bg.b * (1 - a)),
  };
}

export interface ThemeTokens {
  /** Every `--token` declared in any `:root { … }` block. */
  light: Record<string, string>;
  /** `.dark { … }` overlaid on `light` — the dark theme inherits what it doesn't redefine. */
  dark: Record<string, string>;
}

function declarationsIn(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    out[`--${m[1]}`] = m[2].trim();
  }
  return out;
}

function blocksFor(css: string, selector: string): string[] {
  const blocks: string[] = [];
  const re = new RegExp(`(?:^|[\\s}])${selector.replace(".", "\\.")}\\s*\\{`, "g");
  for (const m of css.matchAll(re)) {
    const start = m.index! + m[0].length;
    // These token blocks contain no nested rules, so the first unmatched `}`
    // closes them. Parentheses (env(), calc()) never contain braces.
    const end = css.indexOf("}", start);
    if (end === -1) break;
    blocks.push(css.slice(start, end));
  }
  return blocks;
}

/**
 * Read the design tokens out of `src/index.css` text. Comments are stripped
 * first so a commented-out declaration can't masquerade as a live one.
 */
export function readThemeTokens(css: string): ThemeTokens {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const light: Record<string, string> = {};
  for (const block of blocksFor(clean, ":root")) Object.assign(light, declarationsIn(block));
  const darkOnly: Record<string, string> = {};
  for (const block of blocksFor(clean, ".dark")) Object.assign(darkOnly, declarationsIn(block));
  return { light, dark: { ...light, ...darkOnly } };
}

/**
 * Resolve a colour the way the browser would with the given theme active:
 * `hsl(var(--primary))` → the token's triplet → Rgb. Plain colours pass
 * through `parseColor`. Throws on a token the theme doesn't define, which is
 * exactly the bug the palette test exists to catch.
 */
export function resolveColor(value: string, tokens: Record<string, string>): Rgb {
  const m = value.trim().match(/^hsl\(\s*var\((--[\w-]+)\)\s*\)$/i);
  if (!m) return parseColor(value);
  const triplet = tokens[m[1]];
  if (triplet === undefined) throw new Error(`Token ${m[1]} is not defined in this theme`);
  return hslToRgb(parseHslTriplet(triplet));
}
