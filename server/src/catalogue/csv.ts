// ============================================================================
// TennisAI — a small CSV reader (RFC 4180, the parts that matter)
//
// Written rather than installed: the import endpoint is admin-only, capped at
// 1 MB, and needs exactly one thing — quoted fields parsed correctly — which is
// forty lines. A dependency here would be more surface than substance.
//
// Handles: quoted fields, commas and newlines inside quotes, "" as an escaped
// quote, CRLF or LF line endings, a UTF-8 BOM, and a trailing newline.
// Does NOT handle: alternative delimiters or comment lines. It does not need to.
// ============================================================================

/** Parse CSV text into rows of raw strings. Empty input yields no rows. */
export function parseCsv(text: string): string[][] {
  // Strip a UTF-8 BOM — Excel writes one, and it otherwise becomes part of the
  // first header name, which makes "category" mysteriously not exist.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldWasQuoted = false;

  const endField = () => {
    row.push(fieldWasQuoted ? field : field.trim());
    field = "";
    fieldWasQuoted = false;
  };
  const endRow = () => {
    endField();
    // A blank line is not a record.
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      fieldWasQuoted = true;
    } else if (ch === ",") {
      endField();
    } else if (ch === "\r") {
      // Swallow; the \n that follows ends the row. A lone \r also ends it.
      if (src[i + 1] !== "\n") endRow();
    } else if (ch === "\n") {
      endRow();
    } else {
      field += ch;
    }
  }

  // Trailing field / row with no terminating newline.
  if (field !== "" || fieldWasQuoted || row.length) endRow();

  return rows;
}

export type CsvTable = {
  /** Header names, trimmed and lower-cased for lookup. */
  columns: string[];
  /**
   * One entry per data row. `line` is the row number AS SEEN IN A SPREADSHEET:
   * the header is line 1, so the first data row is line 2. Rejections are
   * reported with this number, because "row 7" has to mean the row the person
   * can actually go and look at.
   */
  rows: Array<{ line: number; get: (column: string) => string | undefined }>;
};

/**
 * Turn parsed CSV into header-addressed rows. Throws when the file has no
 * header at all — every other problem is a per-row rejection, not a failure of
 * the whole upload.
 */
export function readTable(text: string): CsvTable {
  const raw = parseCsv(text);
  if (raw.length === 0) throw new Error("The CSV is empty");

  const columns = raw[0].map((c) => c.trim().toLowerCase());
  const index = new Map<string, number>();
  columns.forEach((c, i) => {
    if (!index.has(c)) index.set(c, i);
  });

  const rows = raw.slice(1).map((cells, i) => ({
    line: i + 2,
    get: (column: string) => {
      const at = index.get(column.toLowerCase());
      if (at === undefined) return undefined;
      const value = cells[at];
      return value === undefined || value === "" ? undefined : value;
    },
  }));

  return { columns, rows };
}

/** Split a pipe-separated list cell ("L1|L2|L3") into trimmed values. */
export function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split("|")
    .map((v) => v.trim())
    .filter(Boolean);
}
