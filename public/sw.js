// TennisAI service worker.
// Two independent jobs in one file:
//   1. Web push — handles incoming push payloads and routes notification
//      clicks back into the app (unchanged behaviour, just moved down below
//      the shell-caching logic).
//   2. App-shell caching — cache-first for the built HTML/JS/CSS/icons so a
//      repeat visit is instant and mostly offline-tolerant. Registered at
//      app start by src/lib/sw/register.ts (registration is idempotent per
//      script URL, so pushClient.ts's own on-demand
//      navigator.serviceWorker.register("/sw.js") call is a no-op re-use of
//      the same registration, not a second worker).
//
// Hard rule: /api/* is NEVER cached and NEVER intercepted. See isApiRequest
// below and the fetch handler, which returns (no respondWith at all) before
// any cache logic runs for an API request.

const CACHE_VERSION = "v1";
const CACHE_NAME = `tennisai-shell-${CACHE_VERSION}`;

// Same-origin static paths that are part of the app shell besides the
// hashed /assets/* bundle (which is matched by prefix, not listed here).
const SHELL_STATIC_PATHS = new Set([
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/og-image.png",
  "/favicon.ico",
]);

/** True for API calls — must never be cached or served from cache. */
function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

/** True for a top-level page navigation (the HTML document). */
function isNavigation(request) {
  return request.mode === "navigate";
}

/**
 * True for content-addressed build output (hashed filename => safe to
 * cache-first forever) and the small set of shell static assets above.
 */
function isShellAsset(url) {
  return url.pathname.startsWith("/assets/") || SHELL_STATIC_PATHS.has(url.pathname);
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Offline or the network failed outright — fall back to whatever shell
    // HTML we last cached, never to a stale API response (there is none;
    // API requests are never cached in the first place).
    const cached = (await cache.match(request)) || (await cache.match("/"));
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  // Only cache successful, same-origin ("basic") responses — never opaque
  // cross-origin responses or error pages.
  if (response && response.ok && response.type === "basic") {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never touch non-GET requests (mutations, etc.).
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never touch cross-origin requests (map tiles, fonts, ...).
  if (url.origin !== self.location.origin) return;

  // Never intercept /api/* — no respondWith at all, so it always goes
  // straight to the network with no service-worker involvement.
  if (isApiRequest(url)) return;

  if (isNavigation(request)) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isShellAsset(url)) {
    event.respondWith(cacheFirstAsset(request));
    return;
  }

  // Anything else same-origin (e.g. source maps in dev) passes through
  // untouched.
});

// Exposed for the classifier unit test (src/lib/sw/__tests__/classify.test.ts),
// which loads this exact file into a vm context and asserts on these
// functions directly rather than a hand-maintained mirror.
self.__tennisaiSwClassify = { isApiRequest, isNavigation, isShellAsset };

// ---------------------------------------------------------------------------
// Web push (unchanged behaviour)
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  let payload = { title: "TennisAI", body: "You have a new notification.", url: "/notifications" };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      const text = event.data.text();
      if (text) payload.body = text;
    }
  }

  const title = payload.title || "TennisAI";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: payload.url || "/notifications" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/notifications";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        try {
          const clientPath = new URL(client.url).pathname;
          if (clientPath === targetUrl && "focus" in client) {
            return client.focus();
          }
        } catch {
          // ignore malformed client URLs and fall through to opening a new one
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
