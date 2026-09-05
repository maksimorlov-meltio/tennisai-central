-- AlterTable
ALTER TABLE "training_drills" ADD COLUMN     "libraryDrillId" TEXT;

-- CreateTable
CREATE TABLE "drills" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "contentHash" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleEs" TEXT NOT NULL,
    "objectiveEn" TEXT NOT NULL,
    "objectiveEs" TEXT NOT NULL,
    "setupEn" TEXT NOT NULL,
    "setupEs" TEXT NOT NULL,
    "progressionEn" TEXT NOT NULL,
    "progressionEs" TEXT NOT NULL,
    "regressionEn" TEXT NOT NULL,
    "regressionEs" TEXT NOT NULL,
    "successCriteriaEn" TEXT NOT NULL,
    "successCriteriaEs" TEXT NOT NULL,
    "stepsEn" TEXT[],
    "stepsEs" TEXT[],
    "cuesEn" TEXT[],
    "cuesEs" TEXT[],
    "commonErrorsEn" TEXT[],
    "commonErrorsEs" TEXT[],
    "levelBands" TEXT[],
    "ageBands" TEXT[],
    "blockKinds" TEXT[],
    "playersMin" INTEGER NOT NULL,
    "playersMax" INTEGER NOT NULL,
    "courtsMin" DOUBLE PRECISION NOT NULL,
    "courtsMax" DOUBLE PRECISION NOT NULL,
    "equipment" TEXT[],
    "defaults" JSONB NOT NULL,
    "ranges" JSONB NOT NULL,
    "diagram" JSONB NOT NULL,
    "requiresQualifiedSupervision" BOOLEAN NOT NULL DEFAULT false,
    "licence" TEXT NOT NULL DEFAULT 'none',
    "authorAgent" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'global',
    "academyId" TEXT,
    "ownerCoachId" TEXT,
    "forkedFromId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drill_sources" (
    "id" TEXT NOT NULL,
    "drillId" TEXT NOT NULL,
    "coachOrBody" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "medium" TEXT NOT NULL,
    "publisherOrChannel" TEXT,
    "url" TEXT,
    "year" INTEGER,
    "timestamp" TEXT,
    "note" TEXT,
    "fetchedAt" TIMESTAMP(3),

    CONSTRAINT "drill_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drill_tags" (
    "id" TEXT NOT NULL,
    "drillId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "drill_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "levelBands" TEXT[],
    "phase" TEXT,
    "blocks" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_sessions" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "playerId" TEXT,
    "teamId" TEXT,
    "constraints" JSONB NOT NULL,
    "proposal" JSONB NOT NULL,
    "final" JSONB,
    "diff" JSONB,
    "assemblerVersion" TEXT NOT NULL,
    "seed" TEXT,
    "aiGenerationId" TEXT,
    "trainingPlanId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_preferences" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "learnedFromSessionId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drill_reviews" (
    "id" TEXT NOT NULL,
    "drillId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reviewerAgentReport" JSONB,
    "humanDecision" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reasons" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drill_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drills_status_visibility_idx" ON "drills"("status", "visibility");

-- CreateIndex
CREATE INDEX "drills_domain_idx" ON "drills"("domain");

-- CreateIndex
CREATE INDEX "drills_academyId_idx" ON "drills"("academyId");

-- CreateIndex
CREATE INDEX "drills_ownerCoachId_idx" ON "drills"("ownerCoachId");

-- CreateIndex
CREATE INDEX "drill_sources_drillId_idx" ON "drill_sources"("drillId");

-- CreateIndex
CREATE INDEX "drill_tags_kind_tag_idx" ON "drill_tags"("kind", "tag");

-- CreateIndex
CREATE UNIQUE INDEX "drill_tags_drillId_kind_tag_key" ON "drill_tags"("drillId", "kind", "tag");

-- CreateIndex
CREATE INDEX "generated_sessions_coachId_createdAt_idx" ON "generated_sessions"("coachId", "createdAt");

-- CreateIndex
CREATE INDEX "generated_sessions_playerId_idx" ON "generated_sessions"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "coach_preferences_coachId_kind_key_key" ON "coach_preferences"("coachId", "kind", "key");

-- CreateIndex
CREATE INDEX "drill_reviews_drillId_createdAt_idx" ON "drill_reviews"("drillId", "createdAt");

-- CreateIndex
CREATE INDEX "training_drills_libraryDrillId_idx" ON "training_drills"("libraryDrillId");

-- AddForeignKey
ALTER TABLE "training_drills" ADD CONSTRAINT "training_drills_libraryDrillId_fkey" FOREIGN KEY ("libraryDrillId") REFERENCES "drills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drills" ADD CONSTRAINT "drills_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drills" ADD CONSTRAINT "drills_ownerCoachId_fkey" FOREIGN KEY ("ownerCoachId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drills" ADD CONSTRAINT "drills_forkedFromId_fkey" FOREIGN KEY ("forkedFromId") REFERENCES "drills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drill_sources" ADD CONSTRAINT "drill_sources_drillId_fkey" FOREIGN KEY ("drillId") REFERENCES "drills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drill_tags" ADD CONSTRAINT "drill_tags_drillId_fkey" FOREIGN KEY ("drillId") REFERENCES "drills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_sessions" ADD CONSTRAINT "generated_sessions_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_sessions" ADD CONSTRAINT "generated_sessions_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_sessions" ADD CONSTRAINT "generated_sessions_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_sessions" ADD CONSTRAINT "generated_sessions_trainingPlanId_fkey" FOREIGN KEY ("trainingPlanId") REFERENCES "training_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_preferences" ADD CONSTRAINT "coach_preferences_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drill_reviews" ADD CONSTRAINT "drill_reviews_drillId_fkey" FOREIGN KEY ("drillId") REFERENCES "drills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
