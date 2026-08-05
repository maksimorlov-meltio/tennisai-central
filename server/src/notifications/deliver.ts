import type { Notification, NotificationPreference, PrismaClient } from "@prisma/client";
import { sendNotificationEmail } from "../email/mailer";
import { isPushConfigured, sendPushToUser } from "../push/webpush";

/**
 * The single funnel for creating a notification AND delivering it.
 *
 * Every code path that wants to notify a user should go through
 * `createAndDeliverNotification` (or the legacy `createNotification` wrapper
 * in ./routes, which now just calls this) instead of calling
 * `prisma.notification.create` directly, so email/push delivery and the
 * opt-out gate are applied uniformly everywhere.
 */

export interface DeliverInput {
  userId: string;
  type: string;
  title: string;
  message: string;
  linkTo?: string;
}

/** The subset of a NotificationPreference row that decides delivery. */
export type PreferenceFlags = Omit<NotificationPreference, "id" | "userId">;

export type CategoryFlag =
  | "trainingReminders"
  | "tournamentReminders"
  | "requestApprovals"
  | "financeUpdates"
  | "aiInsightUpdates"
  | "systemNotifications";

/** A missing NotificationPreference row means the user never touched their
 *  settings — every default in the schema is `true`, so treat it the same
 *  way here rather than silently suppressing delivery. */
export const DEFAULT_PREFERENCES: PreferenceFlags = {
  emailEnabled: true,
  pushEnabled: true,
  trainingReminders: true,
  tournamentReminders: true,
  requestApprovals: true,
  financeUpdates: true,
  aiInsightUpdates: true,
  systemNotifications: true,
};

/**
 * Maps a notification `type` to the preference category that gates it.
 * Unrecognised/new types fall back to `systemNotifications` — the most
 * general bucket — rather than silently bypassing the opt-out gate.
 */
export function categoryForType(type: string): CategoryFlag {
  switch (type) {
    case "training_reminder":
    case "training_created":
    case "training_updated":
    case "training_deleted":
      return "trainingReminders";
    case "tournament_reminder":
      return "tournamentReminders";
    case "request_approval":
    case "training_request_created":
    case "training_request_approved":
    case "training_request_rejected":
    case "training_request_rescheduled":
      return "requestApprovals";
    case "finance_update":
      return "financeUpdates";
    case "ai_insight":
      return "aiInsightUpdates";
    case "system":
    case "calendar_event_created":
    case "calendar_event_updated":
    case "calendar_event_deleted":
    default:
      return "systemNotifications";
  }
}

export interface DeliveryDecision {
  category: CategoryFlag;
  shouldEmail: boolean;
  shouldPush: boolean;
}

/**
 * Pure opt-out gate: a channel is only used when BOTH the channel switch
 * (emailEnabled/pushEnabled) AND the category flag for this notification
 * type are on. A missing category flag on a partial preferences object is
 * treated as on (matches the schema default), never as an implicit opt-out.
 */
export function decideDelivery(
  type: string,
  prefs: Pick<PreferenceFlags, "emailEnabled" | "pushEnabled"> & Partial<PreferenceFlags>,
): DeliveryDecision {
  const category = categoryForType(type);
  const categoryEnabled = prefs[category] ?? true;
  return {
    category,
    shouldEmail: Boolean(prefs.emailEnabled && categoryEnabled),
    shouldPush: Boolean(prefs.pushEnabled && categoryEnabled),
  };
}

/** The Prisma surface the funnel needs — a subset of the full client so it's
 *  trivial to pass a hand-built fake in tests instead of mocking `../db`. */
export type DeliverPrisma = Pick<PrismaClient, "notification" | "notificationPreference" | "user" | "pushSubscription">;

/**
 * Create a Notification row and kick off delivery.
 *
 * Delivery (email + push) is fire-and-forget: it runs after this function
 * returns and is wrapped in try/catch end-to-end, so a mail/push provider
 * failure can NEVER fail the request that triggered the notification. This
 * mirrors the existing `void sendWelcomeEmail(...)` pattern in auth/routes.ts.
 */
export async function createAndDeliverNotification(
  prisma: DeliverPrisma,
  input: DeliverInput,
): Promise<Notification> {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      linkTo: input.linkTo,
      read: false,
    },
  });

  void deliver(prisma, notification).catch((err) => {
    // deliver() already catches per-channel errors; this is a last-resort net
    // so a bug in the funnel itself can never surface as an unhandled rejection.
    console.error(`[notifications] delivery funnel failed for ${notification.id}:`, err instanceof Error ? err.message : err);
  });

  return notification;
}

async function deliver(prisma: DeliverPrisma, notification: Notification): Promise<void> {
  const [prefs, user] = await Promise.all([
    prisma.notificationPreference.findUnique({ where: { userId: notification.userId } }),
    prisma.user.findUnique({ where: { id: notification.userId } }),
  ]);
  if (!user) return; // deleted/unknown user — nothing to deliver to

  const effective = prefs ?? DEFAULT_PREFERENCES;
  const { shouldEmail, shouldPush } = decideDelivery(notification.type, effective);

  if (shouldEmail && !notification.emailedAt) {
    try {
      await sendNotificationEmail({
        to: user.email,
        firstName: user.firstName,
        title: notification.title,
        message: notification.message,
        linkUrl: notification.linkTo ?? undefined,
      });
      // Stamp regardless of the mailer's internal `sent` flag (it may only
      // have logged, e.g. no Gmail creds locally) — this marks the delivery
      // ATTEMPT as done so a future retry/digest sweep never double-sends.
      await prisma.notification.update({ where: { id: notification.id }, data: { emailedAt: new Date() } });
    } catch (err) {
      console.error(`[notifications] email delivery failed for ${notification.id}:`, err instanceof Error ? err.message : err);
    }
  }

  if (shouldPush && isPushConfigured()) {
    try {
      await sendPushToUser(prisma, notification.userId, {
        title: notification.title,
        body: notification.message,
        url: notification.linkTo ?? undefined,
      });
    } catch (err) {
      console.error(`[notifications] push delivery failed for ${notification.id}:`, err instanceof Error ? err.message : err);
    }
  }
}
