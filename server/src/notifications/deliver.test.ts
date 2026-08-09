import { describe, it, expect, vi, beforeEach } from "vitest";

// deliver.ts takes `prisma` as a parameter rather than importing the shared
// singleton, so tests can hand it a hand-built fake instead of vi.mock("../db").
// Only the email/push side-effects (real network calls) need mocking.
vi.mock("../email/mailer", () => ({
  sendNotificationEmail: vi.fn(async () => ({ sent: true })),
}));
vi.mock("../push/webpush", () => ({
  isPushConfigured: vi.fn(() => true),
  sendPushToUser: vi.fn(async () => undefined),
}));

import { sendNotificationEmail } from "../email/mailer";
import { isPushConfigured, sendPushToUser } from "../push/webpush";
import { categoryForType, decideDelivery, createAndDeliverNotification, DEFAULT_PREFERENCES, type PreferenceFlags } from "./deliver";

type AnyMock = ReturnType<typeof vi.fn>;
const asMock = (fn: unknown): AnyMock => fn as unknown as AnyMock;

// A tiny flush for the fire-and-forget delivery chain kicked off inside
// createAndDeliverNotification (it is intentionally not awaited by the
// function itself — see the HARD RULES in deliver.ts). setTimeout(0) runs
// only after Node has fully drained the microtask queue, so every chained
// `await` inside deliver() will have settled by the time it fires.
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("categoryForType", () => {
  it("maps every training_request_* lifecycle type to requestApprovals", () => {
    expect(categoryForType("request_approval")).toBe("requestApprovals");
    expect(categoryForType("training_request_created")).toBe("requestApprovals");
    expect(categoryForType("training_request_approved")).toBe("requestApprovals");
    expect(categoryForType("training_request_rejected")).toBe("requestApprovals");
    expect(categoryForType("training_request_rescheduled")).toBe("requestApprovals");
  });

  it("maps training/tournament/finance/ai types to their own category", () => {
    expect(categoryForType("training_reminder")).toBe("trainingReminders");
    expect(categoryForType("training_created")).toBe("trainingReminders");
    expect(categoryForType("training_updated")).toBe("trainingReminders");
    expect(categoryForType("training_deleted")).toBe("trainingReminders");
    expect(categoryForType("tournament_reminder")).toBe("tournamentReminders");
    expect(categoryForType("finance_update")).toBe("financeUpdates");
    expect(categoryForType("ai_insight")).toBe("aiInsightUpdates");
  });

  it("falls back to systemNotifications for system + unrecognised types", () => {
    expect(categoryForType("system")).toBe("systemNotifications");
    expect(categoryForType("calendar_event_created")).toBe("systemNotifications");
    expect(categoryForType("some_future_type_nobody_registered_yet")).toBe("systemNotifications");
  });
});

describe("decideDelivery (the opt-out gate)", () => {
  const allOn: PreferenceFlags = { ...DEFAULT_PREFERENCES };

  it("uses both channels when the channel switch AND the category flag are on", () => {
    expect(decideDelivery("training_reminder", allOn)).toEqual({
      category: "trainingReminders",
      shouldEmail: true,
      shouldPush: true,
    });
  });

  it("never emails when emailEnabled is off, even if the category is on", () => {
    const d = decideDelivery("finance_update", { ...allOn, emailEnabled: false });
    expect(d.shouldEmail).toBe(false);
    expect(d.shouldPush).toBe(true);
  });

  it("never pushes when pushEnabled is off, even if the category is on", () => {
    const d = decideDelivery("finance_update", { ...allOn, pushEnabled: false });
    expect(d.shouldPush).toBe(false);
    expect(d.shouldEmail).toBe(true);
  });

  it("suppresses BOTH channels when the category itself is opted out — the server-side opt-out gate", () => {
    const d = decideDelivery("ai_insight", { ...allOn, aiInsightUpdates: false });
    expect(d.shouldEmail).toBe(false);
    expect(d.shouldPush).toBe(false);
  });

  it("treats a missing category flag on a partial preferences object as on (matches the schema default)", () => {
    const { aiInsightUpdates: _drop, ...rest } = allOn;
    const d = decideDelivery("ai_insight", rest);
    expect(d.shouldEmail).toBe(true);
    expect(d.shouldPush).toBe(true);
  });
});

describe("createAndDeliverNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(isPushConfigured).mockReturnValue(true);
    asMock(sendNotificationEmail).mockResolvedValue({ sent: true });
    asMock(sendPushToUser).mockResolvedValue(undefined);
  });

  function makeFakePrisma(opts: { prefs?: PreferenceFlags | null; user?: { id: string; email: string; firstName: string } | null } = {}) {
    const row = {
      id: "notif_1",
      userId: "u1",
      type: "finance_update",
      title: "New expense",
      message: "A new expense was logged",
      read: false,
      linkTo: null as string | null,
      createdAt: new Date(),
      emailedAt: null as Date | null,
    };
    return {
      notification: {
        create: vi.fn(async () => row),
        update: vi.fn(async ({ data }: { data: { emailedAt?: Date } }) => ({ ...row, ...data })),
      },
      notificationPreference: {
        findUnique: vi.fn(async () => (opts.prefs === undefined ? null : opts.prefs)),
      },
      user: {
        findUnique: vi.fn(async () =>
          opts.user === undefined ? { id: "u1", email: "player@example.com", firstName: "Ana" } : opts.user,
        ),
      },
      pushSubscription: {},
    };
  }

  it("creates the notification row immediately and returns it without waiting on delivery", async () => {
    const prisma = makeFakePrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await createAndDeliverNotification(prisma as any, {
      userId: "u1",
      type: "finance_update",
      title: "New expense",
      message: "A new expense was logged",
    });
    expect(result.id).toBe("notif_1");
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it("never throws even when the email provider blows up (fire-and-forget hard rule)", async () => {
    asMock(sendNotificationEmail).mockRejectedValue(new Error("smtp down"));
    const prisma = makeFakePrisma();
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createAndDeliverNotification(prisma as any, {
        userId: "u1",
        type: "finance_update",
        title: "t",
        message: "m",
      }),
    ).resolves.toBeTruthy();
    await flush();
  });

  it("does not email or push a user who opted out of the notification's category (server-side enforced)", async () => {
    const prefs: PreferenceFlags = { ...DEFAULT_PREFERENCES, financeUpdates: false };
    const prisma = makeFakePrisma({ prefs });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createAndDeliverNotification(prisma as any, {
      userId: "u1",
      type: "finance_update",
      title: "t",
      message: "m",
    });
    await flush();
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(sendPushToUser).not.toHaveBeenCalled();
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it("emails and stamps emailedAt when the category and email channel are both on", async () => {
    const prisma = makeFakePrisma({ prefs: { ...DEFAULT_PREFERENCES } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createAndDeliverNotification(prisma as any, {
      userId: "u1",
      type: "finance_update",
      title: "t",
      message: "m",
    });
    await flush();
    expect(sendNotificationEmail).toHaveBeenCalledTimes(1);
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "notif_1" }, data: { emailedAt: expect.any(Date) } }),
    );
  });

  it("skips push delivery when VAPID isn't configured, even if pushEnabled is on", async () => {
    asMock(isPushConfigured).mockReturnValue(false);
    const prisma = makeFakePrisma({ prefs: { ...DEFAULT_PREFERENCES } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createAndDeliverNotification(prisma as any, {
      userId: "u1",
      type: "finance_update",
      title: "t",
      message: "m",
    });
    await flush();
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("delivers nothing (but still creates the row) when the target user no longer exists", async () => {
    const prisma = makeFakePrisma({ user: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await createAndDeliverNotification(prisma as any, {
      userId: "ghost",
      type: "finance_update",
      title: "t",
      message: "m",
    });
    expect(result.id).toBe("notif_1");
    await flush();
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(sendPushToUser).not.toHaveBeenCalled();
  });
});
