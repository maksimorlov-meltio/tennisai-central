// ============================================================================
// The browser half of the export: turn a string into a file the user has.
//
// Kept apart from the writer so the writer stays pure and testable — this is
// DOM plumbing with nothing to assert about beyond "the browser did it".
// ============================================================================

/**
 * Hand `text` to the browser as a download named `filename`.
 *
 * A blob URL rather than a `data:` URI: Safari caps data URIs and Firefox
 * ignores the `download` attribute on them, and a season of tournaments is
 * easily past either limit. The URL is revoked on the next tick — revoking it
 * synchronously after `click()` cancels the download in Firefox.
 */
export function downloadTextFile(
  filename: string,
  text: string,
  mimeType = "text/calendar;charset=utf-8",
): void {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
