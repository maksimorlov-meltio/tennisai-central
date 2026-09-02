-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "ageCategory" TEXT,
ADD COLUMN     "entryDeadline" TIMESTAMP(3),
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "registeredCount" INTEGER,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "utrRangeMax" DOUBLE PRECISION,
ADD COLUMN     "utrRangeMin" DOUBLE PRECISION,
ADD COLUMN     "venue" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateIndex
CREATE INDEX "tournaments_federation_startDate_idx" ON "tournaments"("federation", "startDate");
