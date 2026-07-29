-- Additive, non-destructive: tournament geo coordinates + per-user hidden list.
--
-- 1) Two nullable geo columns on "tournaments" (host-city lat/lng). No default,
--    no backfill — existing rows keep NULL until re-imported/seeded.
-- 2) A per-user "hidden_tournaments" list (eliminate-from-suggestions), with a
--    unique (userId, tournamentId) and cascade FKs so a hide-row disappears when
--    its user or tournament is deleted.
--
-- Every statement is guarded (IF NOT EXISTS / duplicate_object) so the migration
-- is safely idempotent and never fails on an already-present object.

-- 1) Geo columns on tournaments (additive, nullable).
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;

-- 2) Per-user hidden-tournaments list.
CREATE TABLE IF NOT EXISTS "hidden_tournaments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hidden_tournaments_pkey" PRIMARY KEY ("id")
);

-- Idempotency (one hide per user+tournament) + owner-scoped lookup index.
CREATE UNIQUE INDEX IF NOT EXISTS "hidden_tournaments_userId_tournamentId_key" ON "hidden_tournaments"("userId", "tournamentId");
CREATE INDEX IF NOT EXISTS "hidden_tournaments_userId_idx" ON "hidden_tournaments"("userId");

-- Cascade FKs (a hide-row is removed when its user or tournament is deleted).
DO $$ BEGIN
  ALTER TABLE "hidden_tournaments" ADD CONSTRAINT "hidden_tournaments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "hidden_tournaments" ADD CONSTRAINT "hidden_tournaments_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
