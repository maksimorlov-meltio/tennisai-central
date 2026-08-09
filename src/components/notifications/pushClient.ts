// Browser-side web-push handshake: register the service worker, request
// Notification permission, and subscribe using the server's VAPID public key.
// Dependency-free — pure browser APIs.

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export interface DeviceSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Registers /sw.js, asks for Notification permission, and subscribes this
 * browser to push using the given VAPID public key. Reuses an existing
 * subscription if one is already active. Throws with a human-readable
 * message on unsupported browsers or a denied permission — callers should
 * catch and surface it rather than let it bubble as an unhandled rejection.
 */
export async function enablePushOnThisDevice(publicKey: string): Promise<DeviceSubscription> {
  if (!isPushSupported()) {
    throw new Error("This browser doesn't support push notifications.");
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("The browser returned an incomplete push subscription.");
  }

  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}
