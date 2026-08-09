import webpush, { WebPushError } from "web-push";
import type { PrismaClient } from "@prisma/client";
import { env } from "../env";

/**
 * Thin wrapper over the `web-push` package.
 *
 * Web push is optional and env-gated: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
 * VAPID_SUBJECT. When either key is unset, `isPushConfigured()` returns false
 * and `sendPushToUser` silently no-ops — email + in-app delivery still work.
 *
 * The VAPID private key is a server-side secret and never leaves this module;
 * only `env.vapidPublicKey` may ever be sent to the browser (see the
 * `GET /push/public-key` route in ../notifications/routes.ts).
 */

let vapidConfigured = false;

function ensureConfigured(): boolean {
  if (vapidConfigured) return true;
  if (!env.vapidPublicKey || !env.vapidPrivateKey) return false;
  webpush.setVapidDetails(
    env.vapidSubject || "mailto:support@tennisai.app",
    env.vapidPublicKey,
    env.vapidPrivateKey,
  );
  vapidConfigured = true;
  return true;
}

/** True once VAPID keys are present and push sending is actually possible. */
export function isPushConfigured(): boolean {
  return ensureConfigured();
}

export interface PushPayload {
  title: string;
  body: string;
  /** In-app path to open on notificationclick, e.g. "/notifications". */
  url?: string;
}

type PushPrisma = Pick<PrismaClient, "pushSubscription">;

/**
 * Send a push notification to every subscription this user has registered
 * (one per device/browser). Never throws — the caller (the delivery funnel)
 * treats push the same as email: fire-and-forget, log-and-continue on error.
 *
 * Subscriptions whose endpoint responds 404/410 are expired/revoked by the
 * browser and are pruned so we stop wasting sends on them.
 */
export async function sendPushToUser(prisma: PushPrisma, userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
      } catch (err) {
        const statusCode = err instanceof WebPushError ? err.statusCode : undefined;
        if (statusCode === 404 || statusCode === 410) {
          // Expired/revoked endpoint — prune it so future sends don't retry it.
          await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } }).catch(() => {});
        } else {
          console.error(`[push] send failed (subscription ${sub.id}):`, err instanceof Error ? err.message : err);
        }
      }
    }),
  );
}
