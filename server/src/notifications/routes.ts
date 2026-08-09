import { Router } from "express";
import { z } from "zod";
import type { Notification, NotificationPreference } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { asyncHandler, requireAuth, ok, HttpError, type AuthedRequest } from "../http";
import { createAndDeliverNotification, type DeliverInput } from "./deliver";

// Mounted at /api.
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

function present(n: Notification) {
  return {
    id: n.id,
    userId: n.userId,
    type: n.type,
    title: n.title,
    message: n.message,
    read: n.read,
    linkTo: n.linkTo ?? undefined,
    createdAt: n.createdAt.toISOString(),
  };
}

function presentPrefs(p: NotificationPreference) {
  return {
    emailEnabled: p.emailEnabled,
    pushEnabled: p.pushEnabled,
    trainingReminders: p.trainingReminders,
    tournamentReminders: p.tournamentReminders,
    requestApprovals: p.requestApprovals,
    financeUpdates: p.financeUpdates,
    aiInsightUpdates: p.aiInsightUpdates,
    systemNotifications: p.systemNotifications,
  };
}

// Used for both PATCH (legacy, partial) and PUT (per the notify-agent spec) —
// both are honoured as a partial upsert-merge; neither requires the caller to
// resend every field just to flip one switch.
const prefsSchema = z
  .object({
    emailEnabled: z.boolean(),
    pushEnabled: z.boolean(),
    trainingReminders: z.boolean(),
    tournamentReminders: z.boolean(),
    requestApprovals: z.boolean(),
    financeUpdates: z.boolean(),
    aiInsightUpdates: z.boolean(),
    systemNotifications: z.boolean(),
  })
  .partial();

async function upsertPrefs(userId: string, patch: z.infer<typeof prefsSchema>) {
  return prisma.notificationPreference.upsert({
    where: { userId },
    update: patch,
    create: { userId, ...patch },
  });
}

/**
 * Create + deliver (email/push, preference-gated) a notification. Reused by
 * other domains (e.g. trainingRequests) exactly as the old `createNotification`
 * was — fire-and-forget from the caller's side, never throws.
 */
export async function createNotification(input: DeliverInput): Promise<void> {
  try {
    await createAndDeliverNotification(prisma, input);
  } catch {
    /* a failed notification must never break the triggering action */
  }
}

notificationsRouter.get(
  "/notifications",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await prisma.notification.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: "desc" },
    });
    return ok(res, rows.map(present));
  }),
);

notificationsRouter.patch(
  "/notifications/read-all",
  asyncHandler(async (req: AuthedRequest, res) => {
    await prisma.notification.updateMany({ where: { userId: req.userId! }, data: { read: true } });
    return ok(res, null);
  }),
);

notificationsRouter.patch(
  "/notifications/:id/read",
  asyncHandler(async (req: AuthedRequest, res) => {
    const n = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!n) throw new HttpError(404, "Notification not found");
    if (n.userId !== req.userId) throw new HttpError(403, "Not your notification");
    await prisma.notification.update({ where: { id: req.params.id }, data: { read: true } });
    return ok(res, null);
  }),
);

notificationsRouter.get(
  "/notification-preferences",
  asyncHandler(async (req: AuthedRequest, res) => {
    // A missing row = the user never touched settings; upsert with an empty
    // patch materialises it with the schema's all-on defaults so the client
    // always gets a full, real preference object back.
    const prefs = await upsertPrefs(req.userId!, {});
    return ok(res, presentPrefs(prefs));
  }),
);

notificationsRouter.patch(
  "/notification-preferences",
  asyncHandler(async (req: AuthedRequest, res) => {
    const d = prefsSchema.parse(req.body);
    const prefs = await upsertPrefs(req.userId!, d);
    return ok(res, presentPrefs(prefs), "Preferences updated");
  }),
);

// PUT alias of the PATCH above (same partial-merge semantics) — the
// notification-settings UI (channel + category toggles) targets this verb.
notificationsRouter.put(
  "/notification-preferences",
  asyncHandler(async (req: AuthedRequest, res) => {
    const d = prefsSchema.parse(req.body);
    const prefs = await upsertPrefs(req.userId!, d);
    return ok(res, presentPrefs(prefs), "Preferences updated");
  }),
);

// ── Web push ──────────────────────────────────────────────────────────────
// Optional, env-gated (VAPID keys). Only the PUBLIC key is ever sent to the
// client; sending itself is handled server-side in ../push/webpush.ts.

notificationsRouter.get(
  "/push/public-key",
  asyncHandler(async (_req: AuthedRequest, res) => {
    return ok(res, { publicKey: env.vapidPublicKey ?? null });
  }),
);

const subscribeSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
});

notificationsRouter.post(
  "/push/subscribe",
  asyncHandler(async (req: AuthedRequest, res) => {
    const d = subscribeSchema.parse(req.body);
    const sub = await prisma.pushSubscription.upsert({
      where: { endpoint: d.endpoint },
      update: { userId: req.userId!, p256dh: d.keys.p256dh, auth: d.keys.auth, userAgent: d.userAgent },
      create: {
        userId: req.userId!,
        endpoint: d.endpoint,
        p256dh: d.keys.p256dh,
        auth: d.keys.auth,
        userAgent: d.userAgent,
      },
    });
    return ok(res, { id: sub.id }, "Push subscription saved", 201);
  }),
);

const unsubscribeSchema = z.object({ endpoint: z.string().min(1) });

notificationsRouter.delete(
  "/push/subscribe",
  asyncHandler(async (req: AuthedRequest, res) => {
    // Accept the endpoint from either the JSON body or a query string so the
    // client can use whichever is more convenient with fetch's DELETE support.
    const { endpoint } = unsubscribeSchema.parse(
      req.body && Object.keys(req.body).length ? req.body : req.query,
    );
    // Owner-scoped: deleteMany with BOTH endpoint and userId means this can
    // never remove another user's subscription even if the endpoint leaked.
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.userId! } });
    return ok(res, null, "Push subscription removed");
  }),
);
