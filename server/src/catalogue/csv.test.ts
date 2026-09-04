// ============================================================================
// Unit tests — the CSV reader.
//
// The failure that matters here is silent: a mis-parsed quoted field does not
// error, it shifts every column after it by one, and a spec sheet imports with
// the balance in the weight column. So these tests assert cell-for-cell.
// ============================================================================

import { describe, it, expect } from "vitest";
import { parseCsv, readTable, splitList } from "./csv";

describe("parseCsv", () => {
  it("parses a plain table", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("keeps a comma that lives inside a quoted field", () => {
    expect(parseCsv('brand,model\nWilson,"Pro Staff 97, v14"')).toEqual([
      ["brand", "model"],
      ["Wilson", "Pro Staff 97, v14"],
    ]);
  });

  it('unescapes "" to a single quote', () => {
    expect(parseCsv('note\n"He said ""no"""')).toEqual([["note"], ['He said "no"']]);
  });

  it("keeps a newline inside a quoted field instead of splitting the record", () => {
    const rows = parseCsv('a,b\n"line one\nline two",x');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(["line one\nline two", "x"]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a UTF-8 BOM so the first header name is still usable", () => {
    expect(parseCsv("﻿category,brand\nracket,Head")[0][0]).toBe("category");
  });

  it("ignores a trailing newline and blank lines", () => {
    expect(parseCsv("a\n1\n\n")).toEqual([["a"], ["1"]]);
  });

  it("trims unquoted fields but preserves whitespace inside quotes", () => {
    expect(parseCsv('a,b\n  x  ,"  y  "')[1]).toEqual(["x", "  y  "]);
  });

  it("returns no rows for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("readTable", () => {
  it("addresses cells by header name, case-insensitively", () => {
    const t = readTable("Category,Brand\nracket,Head");
    expect(t.rows[0].get("category")).toBe("racket");
    expect(t.rows[0].get("BRAND")).toBe("Head");
  });

  it("numbers data rows the way a spreadsheet does — the header is line 1", () => {
    const t = readTable("a\n1\n2\n3");
    expect(t.rows.map((r) => r.line)).toEqual([2, 3, 4]);
  });

  it("reports an empty cell and an unknown column both as undefined", () => {
    const t = readTable("a,b\n1,");
    expect(t.rows[0].get("b")).toBeUndefined();
    expect(t.rows[0].get("nope")).toBeUndefined();
  });

  it("throws only when there is no header at all", () => {
    expect(() => readTable("")).toThrow();
    // A header with no data rows is not a parse failure — the route decides.
    expect(readTable("a,b").rows).toHaveLength(0);
  });
});

describe("splitList", () => {
  it("splits pipe-separated cells and drops blanks", () => {
    expect(splitList("L1|L2 | L3|")).toEqual(["L1", "L2", "L3"]);
    expect(splitList(undefined)).toEqual([]);
  });
});
