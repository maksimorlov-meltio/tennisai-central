-- Wave 1 (additive, non-destructive): authz-supporting indexes + signup consent columns.
--
-- 1) Indexes covering the authz "who created / owns this" lookups that were
--    previously unindexed. All guarded with IF NOT EXISTS so the migration is
--    safely idempotent and never fails on an already-present index.
--    (onDelete behaviour is intentionally left unchanged — cascade review is Wave 2.)
-- 2) Two nullable consent columns on "users", written by the auth agent at signup.
--    No default, no backfill — additive only, existing rows keep NULL.

-- Match.createdBy lookups
CREATE INDEX IF NOT EXISTS "matches_createdBy_idx" ON "matches"("createdBy");

-- ScoutingReport.createdById
CREATE INDEX IF NOT EXISTS "scouting_reports_createdById_idx" ON "scouting_reports"("createdById");

-- GamePlan.opponentId + GamePlan.createdById
CREATE INDEX IF NOT EXISTS "game_plans_opponentId_idx" ON "game_plans"("opponentId");
CREATE INDEX IF NOT EXISTS "game_plans_createdById_idx" ON "game_plans"("createdById");

-- PostMatchReport.createdById
CREATE INDEX IF NOT EXISTS "post_match_reports_createdById_idx" ON "post_match_reports"("createdById");

-- TrainingPlan.createdById
CREATE INDEX IF NOT EXISTS "training_plans_createdById_idx" ON "training_plans"("createdById");

-- Consent columns on users (additive, nullable)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ageConfirmedAt" TIMESTAMP(3);
