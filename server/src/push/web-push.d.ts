// Minimal ambient types for the `web-push` package.
//
// DefinitelyTyped does publish `@types/web-push`, but we were told not to
// install any new dependency for this feature (web-push itself is already in
// package.json; only its types are missing). This declares just the surface
// this app actually calls — setVapidDetails + sendNotification — so the rest
// of the module keeps strict-TS checking without an `any` escape hatch.
declare module "web-push" {
  export interface PushSubscriptionKeys {
    p256dh: string;
    auth: string;
  }

  export interface PushSubscription {
    endpoint: string;
    keys: PushSubscriptionKeys;
  }

  export interface VapidDetails {
    subject: string;
    publicKey: string;
    privateKey: string;
  }

  export interface RequestOptions {
    TTL?: number;
    vapidDetails?: VapidDetails;
    headers?: Record<string, string>;
    contentEncoding?: string;
    proxy?: string;
    timeout?: number;
  }

  export interface SendResult {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
  }

  /** Thrown by sendNotification on a non-2xx response from the push service. */
  export class WebPushError extends Error {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
    endpoint: string;
  }

  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  export function sendNotification(
    subscription: PushSubscription,
    payload?: string | Buffer,
    options?: RequestOptions,
  ): Promise<SendResult>;
  export function generateVAPIDKeys(): { publicKey: string; privateKey: string };
}
