#!/usr/bin/env node --experimental-strip-types
// ============================================================
// TennisAI — design-token contrast audit
//
// Reads src/index.css (both :root and .dark) plus the hex palettes in
// src/lib/calendar/colors.ts, computes the WCAG 2.1 contrast ratio of every
// foreground/background pair the app actually renders, and prints a Markdown
// table: pair -> light ratio -> dark ratio -> verdict against that pair's
// floor (4.5:1 text, 3:1 non-text UI). Exit code 1 if anything fails, so it
// can gate a change to the palette. No dependencies beyond Node >= 22.
//
//   node --experimental-strip-types scripts/contrast-audit.mts
//   node --experimental-strip-types scripts/contrast-audit.mts <other-checkout>
//
// The maths lives in src/lib/a11y/contrast.ts (unit-tested); the calendar
// palette is ALSO asserted in CI by src/lib/calendar/__tests__/
// paletteContrast.test.ts. This script is the wider, human-readable sweep —
// run it whenever a token in index.css or a hex in colors.ts moves, and paste
// the table into the PR. See docs/design/tokens.md, "How to add a colour".
// ============================================================
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  composite,
  contrastRatio,
  hexToRgb,
  hslToRgb,
  meetsAA,
  parseHslTriplet,
  readThemeTokens,
  roundRatio,
  rgbToHex,
  type Rgb,
} from "../src/lib/a11y/contrast.ts";

const root = process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(resolve(root, "src/index.css"), "utf8");
const colorsTs = readFileSync(resolve(root, "src/lib/calendar/colors.ts"), "utf8");
const { light, dark } = readThemeTokens(css);

type Role = "text" | "large" | "ui" | "info";
const FLOOR: Record<Role, number | null> = { text: 4.5, large: 3, ui: 3, info: null };

interface Row {
  label: string;
  role: Role;
  light: number;
  dark: number;
}

const tok = (tokens: Record<string, string>, name: string): Rgb => {
  const v = tokens[name];
  if (v === undefined) throw new Error(`${name} missing`);
  return hslToRgb(parseHslTriplet(v));
};

const rows: Row[] = [];

function pair(label: string, role: Role, fg: string, bg: string) {
  rows.push({
    label,
    role,
    light: roundRatio(contrastRatio(tok(light, fg), tok(light, bg))),
    dark: roundRatio(contrastRatio(tok(dark, fg), tok(dark, bg))),
  });
}

/** fg text on a translucent tint of `tint` at `alpha` over `bg` (e.g. text-primary on bg-primary/10). */
function tintPair(label: string, role: Role, fg: string, tint: string, alpha: number, bg: string) {
  const l = contrastRatio(tok(light, fg), composite(tok(light, tint), tok(light, bg), alpha));
  const d = contrastRatio(tok(dark, fg), composite(tok(dark, tint), tok(dark, bg), alpha));
  rows.push({ label, role, light: roundRatio(l), dark: roundRatio(d) });
}

function hexPair(label: string, role: Role, hex: string, bg: string) {
  const c = hexToRgb(hex);
  rows.push({
    label,
    role,
    light: roundRatio(contrastRatio(c, tok(light, bg))),
    dark: roundRatio(contrastRatio(c, tok(dark, bg))),
  });
}

// ── Core text pairs ────────────────────────────────────────────────────────
pair("--foreground on --background", "text", "--foreground", "--background");
pair("--foreground on --card", "text", "--foreground", "--card");
pair("--foreground on --muted", "text", "--foreground", "--muted");
pair("--foreground on --accent (hover rows)", "text", "--foreground", "--accent");
pair("--muted-foreground on --background", "text", "--muted-foreground", "--background");
pair("--muted-foreground on --card", "text", "--muted-foreground", "--card");
pair("--muted-foreground on --muted", "text", "--muted-foreground", "--muted");
pair("--muted-foreground on --secondary", "text", "--muted-foreground", "--secondary");
pair("--muted-foreground on --accent (hover rows)", "text", "--muted-foreground", "--accent");
pair("--card-foreground on --card", "text", "--card-foreground", "--card");
pair("--popover-foreground on --popover", "text", "--popover-foreground", "--popover");
pair("--secondary-foreground on --secondary", "text", "--secondary-foreground", "--secondary");
pair("--accent-foreground on --accent", "text", "--accent-foreground", "--accent");

// ── Accent (primary) ───────────────────────────────────────────────────────
pair("--primary-foreground on --primary (buttons, active nav)", "text", "--primary-foreground", "--primary");
tintPair("--primary-foreground on --primary/90 (button hover)", "text", "--primary-foreground", "--primary", 0.9, "--background");
pair("--primary as text on --background (links, text-primary)", "text", "--primary", "--background");
pair("--primary as text on --card", "text", "--primary", "--card");
pair("--primary as text on --muted", "text", "--primary", "--muted");
tintPair("--primary as text on --primary/10 tint over --background (badges)", "text", "--primary", "--primary", 0.1, "--background");
tintPair("--primary as text on --primary/10 tint over --card (badges in cards)", "text", "--primary", "--primary", 0.1, "--card");
pair("--primary as UI/graphic on --background (chart line, icons)", "ui", "--primary", "--background");
pair("--primary as UI/graphic on --card", "ui", "--primary", "--card");

// ── Destructive ───────────────────────────────────────────────────────────
pair("--destructive-foreground on --destructive (delete buttons)", "text", "--destructive-foreground", "--destructive");
tintPair("--destructive-foreground on --destructive/90 (hover)", "text", "--destructive-foreground", "--destructive", 0.9, "--background");
pair("--destructive as text on --background (error text)", "text", "--destructive", "--background");
pair("--destructive as text on --card", "text", "--destructive", "--card");
tintPair("--destructive as text on --destructive/10 tint over --background (error banners)", "text", "--destructive", "--destructive", 0.1, "--background");
tintPair("--destructive as text on --destructive/10 tint over --card", "text", "--destructive", "--destructive", 0.1, "--card");

// ── Focus ring / borders (non-text) ───────────────────────────────────────
pair("--ring on --background (focus indicator)", "ui", "--ring", "--background");
pair("--ring on --card", "ui", "--ring", "--card");
pair("--ring on --popover", "ui", "--ring", "--popover");
pair("--input border on --background", "info", "--input", "--background");
pair("--border on --background", "info", "--border", "--background");

// ── Sidebar tokens ────────────────────────────────────────────────────────
pair("--sidebar-foreground on --sidebar-background", "text", "--sidebar-foreground", "--sidebar-background");
pair("--sidebar-primary-foreground on --sidebar-primary", "text", "--sidebar-primary-foreground", "--sidebar-primary");
pair("--sidebar-accent-foreground on --sidebar-accent", "text", "--sidebar-accent-foreground", "--sidebar-accent");
pair("--sidebar-primary as text on --sidebar-background", "text", "--sidebar-primary", "--sidebar-background");
pair("--sidebar-ring on --sidebar-background", "ui", "--sidebar-ring", "--sidebar-background");

// ── Calendar palette (theme-aware tokens, used as chip TEXT) ──────────────
const calTokens = Object.keys(light).filter((k) => k.startsWith("--cal-"));
for (const k of calTokens) {
  pair(`${k} as text on --background`, "text", k, "--background");
  pair(`${k} as text on --card`, "text", k, "--card");
}

// ── Calendar palette (raw hex, theme-independent: dots, bars, tints) ──────
function hexList(name: string): string[] {
  const m = colorsTs.match(new RegExp(`export const ${name}[^=]*=\\s*(\\[[\\s\\S]*?\\]|\\{[\\s\\S]*?\\})`));
  if (!m) throw new Error(`${name} not found in colors.ts`);
  return [...m[1].matchAll(/#[0-9a-fA-F]{6}/g)].map((x) => x[0]);
}
for (const hex of hexList("ENTITY_PALETTE")) {
  hexPair(`ENTITY_PALETTE ${hex} on --background`, "ui", hex, "--background");
  hexPair(`ENTITY_PALETTE ${hex} on --card`, "ui", hex, "--card");
}
for (const hex of hexList("SURFACE_COLOR")) {
  hexPair(`SURFACE_COLOR ${hex} on --background`, "ui", hex, "--background");
  hexPair(`SURFACE_COLOR ${hex} on --card`, "ui", hex, "--card");
}

// ── Output ────────────────────────────────────────────────────────────────
const verdict = (r: Row) => {
  const floor = FLOOR[r.role];
  if (floor === null) return "info";
  const okL = r.light >= floor;
  const okD = r.dark >= floor;
  if (okL && okD) return "pass";
  if (!okL && !okD) return "FAIL (both)";
  return okL ? "FAIL (dark)" : "FAIL (light)";
};

const floorLabel = (role: Role) => (role === "text" ? "4.5" : role === "info" ? "—" : "3");

console.log("| Pair | Role (floor) | Light | Dark | Verdict |");
console.log("|---|---|---:|---:|---|");
for (const r of rows) {
  console.log(`| ${r.label} | ${r.role} (${floorLabel(r.role)}) | ${r.light.toFixed(2)} | ${r.dark.toFixed(2)} | ${verdict(r)} |`);
}
const failures = rows.filter((r) => verdict(r).startsWith("FAIL"));
console.log("");
console.log(`${rows.length} pairs checked, ${failures.length} failing.`);
for (const f of failures) console.log(`  - ${f.label}: light ${f.light} / dark ${f.dark} (needs ${floorLabel(f.role)})`);

// Hex of key tokens, handy when writing docs.
console.log("");
console.log("Key token hex (light / dark):");
for (const k of ["--background", "--card", "--foreground", "--muted-foreground", "--primary", "--primary-foreground", "--destructive", "--destructive-foreground", "--ring", "--input", "--border", ...calTokens]) {
  console.log(`  ${k}: ${rgbToHex(tok(light, k))} / ${rgbToHex(tok(dark, k))}`);
}

if (failures.length > 0) process.exitCode = 1;
