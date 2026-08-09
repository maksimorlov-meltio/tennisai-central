// TennisAI web-push service worker.
// Minimal and dependency-free: handles incoming push payloads and routes
// notification clicks back into the app. Registered on demand by
// src/components/notifications/pushClient.ts ("Enable push on this device").

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

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
    icon: "/favicon.ico",
    badge: "/favicon.ico",
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
