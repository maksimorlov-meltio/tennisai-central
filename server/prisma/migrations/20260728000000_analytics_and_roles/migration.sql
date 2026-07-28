-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('generated', 'approved', 'rejected', 'outdated');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('free', 'player_pro', 'coach_pro', 'academy');

-- CreateTable
CREATE TABLE "player_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateOfBirth" TEXT,
    "playingLevel" TEXT,
    "ranking" TEXT,
    "dominantHand" TEXT,
    "backhandType" TEXT,
    "preferredSurface" TEXT,
    "currentCoachId" TEXT,
    "preferredCourtPosition" TEXT,
    "technicalStrengths" TEXT[],
    "technicalWeaknesses" TEXT[],
    "physicalStrengths" TEXT[],
    "physicalLimitations" TEXT[],
    "serveTendencies" TEXT,
    "returnTendencies" TEXT,
    "mentalUnderPressure" TEXT,
    "currentGoals" TEXT,
    "injuryRestrictions" TEXT,
    "styleAggression" INTEGER,
    "styleNetPlay" INTEGER,
    "styleRallyTolerance" INTEGER,
    "styleServeDependence" INTEGER,
    "styleRiskLevel" INTEGER,
    "styleReturnPosition" INTEGER,
    "stylePressure" INTEGER,
    "suitClay" INTEGER,
    "suitHard" INTEGER,
    "suitGrass" INTEGER,
    "suitIndoor" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "private_coach_notes" (
    "id" TEXT NOT NULL,
    "authorCoachId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "opponentId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "private_coach_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opponents" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "academyId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dominantHand" TEXT,
    "backhandType" TEXT,
    "preferredSurface" TEXT,
    "strongestStroke" TEXT,
    "weakestStroke" TEXT,
    "servePatterns" TEXT,
    "returnPosition" TEXT,
    "returnTendencies" TEXT,
    "forehandPreference" TEXT,
    "backhandPreference" TEXT,
    "netBehaviour" TEXT,
    "pressurePerformance" TEXT,
    "styleAggression" INTEGER,
    "styleNetPlay" INTEGER,
    "styleRallyTolerance" INTEGER,
    "styleServeDependence" INTEGER,
    "styleRiskLevel" INTEGER,
    "styleReturnPosition" INTEGER,
    "stylePressure" INTEGER,
    "observations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opponents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "opponentId" TEXT,
    "academyId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "competition" TEXT,
    "surface" TEXT NOT NULL,
    "indoorOutdoor" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "result" TEXT,
    "scoreSets" JSONB NOT NULL,
    "conditions" TEXT,
    "firstServeAttempts" INTEGER,
    "firstServesIn" INTEGER,
    "firstServePointsWon" INTEGER,
    "secondServePlayed" INTEGER,
    "secondServePointsWon" INTEGER,
    "aces" INTEGER,
    "doubleFaults" INTEGER,
    "returnPointsPlayed" INTEGER,
    "returnPointsWon" INTEGER,
    "winners" INTEGER,
    "forcedErrors" INTEGER,
    "unforcedErrors" INTEGER,
    "breakPointsCreated" INTEGER,
    "breakPointsConverted" INTEGER,
    "breakPointsFaced" INTEGER,
    "breakPointsSaved" INTEGER,
    "netApproaches" INTEGER,
    "netPointsWon" INTEGER,
    "rallyLengthBuckets" JSONB,
    "momentumChanges" JSONB,
    "notesBySet" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scouting_reports" (
    "id" TEXT NOT NULL,
    "opponentId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "academyId" TEXT,
    "content" JSONB NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'generated',
    "model" TEXT,
    "promptVersion" TEXT,
    "sourceRecordIds" JSONB,
    "confidenceOverall" DOUBLE PRECISION,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scouting_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_plans" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "opponentId" TEXT,
    "createdById" TEXT NOT NULL,
    "academyId" TEXT,
    "content" JSONB NOT NULL,
    "coachOverrides" JSONB,
    "status" "ReportStatus" NOT NULL DEFAULT 'generated',
    "model" TEXT,
    "promptVersion" TEXT,
    "sourceRecordIds" JSONB,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_match_reports" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'generated',
    "model" TEXT,
    "promptVersion" TEXT,
    "sourceRecordIds" JSONB,
    "confidenceOverall" DOUBLE PRECISION,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_match_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_plans" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "sourceReportId" TEXT,
    "title" TEXT NOT NULL,
    "weekOf" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'generated',
    "model" TEXT,
    "promptVersion" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_drills" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "durationMin" INTEGER,
    "reps" TEXT,
    "equipment" TEXT,
    "intensity" TEXT,
    "successCriteria" TEXT NOT NULL,
    "relatedInsight" TEXT,
    "coachNotes" TEXT,
    "completionStatus" TEXT NOT NULL DEFAULT 'pending',
    "trainingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_drills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_generations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "reportId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "academyId" TEXT,
    "tier" "PlanTier" NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "periodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_counters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "reportsGenerated" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academy_memberships" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academy_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_assignments" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardianships" (
    "id" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "juniorPlayerId" TEXT NOT NULL,
    "parentalConsent" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardianships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "player_profiles_userId_key" ON "player_profiles"("userId");

-- CreateIndex
CREATE INDEX "private_coach_notes_authorCoachId_idx" ON "private_coach_notes"("authorCoachId");

-- CreateIndex
CREATE INDEX "private_coach_notes_subjectUserId_idx" ON "private_coach_notes"("subjectUserId");

-- CreateIndex
CREATE INDEX "opponents_ownerId_idx" ON "opponents"("ownerId");

-- CreateIndex
CREATE INDEX "matches_playerId_idx" ON "matches"("playerId");

-- CreateIndex
CREATE INDEX "matches_opponentId_idx" ON "matches"("opponentId");

-- CreateIndex
CREATE INDEX "matches_date_idx" ON "matches"("date");

-- CreateIndex
CREATE INDEX "scouting_reports_opponentId_idx" ON "scouting_reports"("opponentId");

-- CreateIndex
CREATE INDEX "game_plans_playerId_idx" ON "game_plans"("playerId");

-- CreateIndex
CREATE INDEX "post_match_reports_matchId_idx" ON "post_match_reports"("matchId");

-- CreateIndex
CREATE INDEX "training_plans_playerId_idx" ON "training_plans"("playerId");

-- CreateIndex
CREATE INDEX "training_drills_planId_idx" ON "training_drills"("planId");

-- CreateIndex
CREATE INDEX "ai_generations_userId_idx" ON "ai_generations"("userId");

-- CreateIndex
CREATE INDEX "ai_generations_inputHash_idx" ON "ai_generations"("inputHash");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_ownerUserId_key" ON "subscriptions"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_counters_userId_periodKey_key" ON "ai_usage_counters"("userId", "periodKey");

-- CreateIndex
CREATE INDEX "academy_memberships_userId_idx" ON "academy_memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "academy_memberships_academyId_userId_key" ON "academy_memberships"("academyId", "userId");

-- CreateIndex
CREATE INDEX "coach_assignments_coachId_idx" ON "coach_assignments"("coachId");

-- CreateIndex
CREATE INDEX "coach_assignments_playerId_idx" ON "coach_assignments"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "coach_assignments_coachId_playerId_key" ON "coach_assignments"("coachId", "playerId");

-- CreateIndex
CREATE INDEX "guardianships_guardianId_idx" ON "guardianships"("guardianId");

-- CreateIndex
CREATE INDEX "guardianships_juniorPlayerId_idx" ON "guardianships"("juniorPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "guardianships_guardianId_juniorPlayerId_key" ON "guardianships"("guardianId", "juniorPlayerId");

-- AddForeignKey
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_coach_notes" ADD CONSTRAINT "private_coach_notes_authorCoachId_fkey" FOREIGN KEY ("authorCoachId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_coach_notes" ADD CONSTRAINT "private_coach_notes_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opponents" ADD CONSTRAINT "opponents_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "opponents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scouting_reports" ADD CONSTRAINT "scouting_reports_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "opponents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scouting_reports" ADD CONSTRAINT "scouting_reports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_plans" ADD CONSTRAINT "game_plans_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_plans" ADD CONSTRAINT "game_plans_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "opponents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_plans" ADD CONSTRAINT "game_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_match_reports" ADD CONSTRAINT "post_match_reports_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_match_reports" ADD CONSTRAINT "post_match_reports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_drills" ADD CONSTRAINT "training_drills_planId_fkey" FOREIGN KEY ("planId") REFERENCES "training_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_counters" ADD CONSTRAINT "ai_usage_counters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_memberships" ADD CONSTRAINT "academy_memberships_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_memberships" ADD CONSTRAINT "academy_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_assignments" ADD CONSTRAINT "coach_assignments_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_assignments" ADD CONSTRAINT "coach_assignments_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_juniorPlayerId_fkey" FOREIGN KEY ("juniorPlayerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

