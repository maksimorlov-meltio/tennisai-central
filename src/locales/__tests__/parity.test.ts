// Keeps the locale bundles from silently drifting apart: every key that
// exists in en.json must exist in es.json and vice versa, and every
// `{placeholder}` interpolated in an English string must appear somewhere in
// its Spanish counterpart (word order can move; the variable can't vanish).
import { describe, expect, it } from "vitest";
import en from "@/locales/en.json";
import es from "@/locales/es.json";

type MessageNode = string | { [key: string]: MessageNode };

function flatten(node: MessageNode, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof node === "string") {
    out[prefix] = node;
    return out;
  }
  for (const [key, value] of Object.entries(node)) {
    flatten(value, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

/** Every `{name}` and every ICU-plural variable name (`{count, plural, ...}` → `count`). */
function placeholdersOf(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(/\{(\w+)(?:,|\})/g)) {
    names.add(match[1]);
  }
  return [...names];
}

describe("locale bundle parity (en <-> es)", () => {
  const enFlat = flatten(en);
  const esFlat = flatten(es);
  const enKeys = new Set(Object.keys(enFlat));
  const esKeys = new Set(Object.keys(esFlat));

  it("es.json has every key en.json has", () => {
    const missingInEs = [...enKeys].filter((key) => !esKeys.has(key));
    expect(missingInEs).toEqual([]);
  });

  it("en.json has every key es.json has (no orphaned Spanish-only keys)", () => {
    const missingInEn = [...esKeys].filter((key) => !enKeys.has(key));
    expect(missingInEn).toEqual([]);
  });

  it("every interpolated placeholder in an English string survives in its Spanish translation", () => {
    const problems: string[] = [];
    for (const key of enKeys) {
      if (!esKeys.has(key)) continue; // already reported above
      const enPlaceholders = placeholdersOf(enFlat[key]);
      const esPlaceholders = new Set(placeholdersOf(esFlat[key]));
      for (const placeholder of enPlaceholders) {
        if (!esPlaceholders.has(placeholder)) {
          problems.push(`${key}: missing {${placeholder}} in es.json`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
