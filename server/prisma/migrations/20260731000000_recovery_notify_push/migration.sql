-- Phase 1 (additive, idempotent): account recovery + notification delivery + web push.
--
-- 1) users.passwordChangedAt      — makes password-reset links effectively single-use
--    (a token issued before this timestamp is rejected).
-- 2) notifications.emailedAt      — delivery marker so a retry/sweep can't double-send.
-- 3) notification_preferences     — channel-level email/push switches.
-- 4) push_subscriptions           — browser Web-Push endpoints (one row per device).
--
-- No existing column is altered or dropped; every statement is guarded so re-running
-- the migration on an already-migrated database is a no-op.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);

ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "emailedAt" TIMESTAMP(3);

ALTER TABLE "notification_preferences" ADD COLUMN IF NOT EXISTS "emailEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "notification_preferences" ADD COLUMN IF NOT EXISTS "pushEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX IF NOT EXISTS "push_subscriptions_userId_idx" ON "push_subscriptions"("userId");

DO $$
BEGIN
    ALTER TABLE "push_subscriptions"
        ADD CONSTRAINT "push_subscriptions_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
