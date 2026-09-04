// Registers the app-shell service worker at app start.
//
// This is safe to call alongside src/components/notifications/pushClient.ts,
// which registers the same script URL ("/sw.js") on demand when the user
// enables push: navigator.serviceWorker.register() is idempotent for an
// identical script URL — the browser reuses the existing registration
// instead of creating a second worker, so pushClient.ts still gets back the
// registration it expects (with an active/activating worker it can call
// pushManager on).
export function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      // Non-fatal: the app works without the shell cache, just without the
      // repeat-visit speed-up.
      console.error("[sw] registration failed", error);
    });
  });
}
