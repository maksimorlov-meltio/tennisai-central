-- AlterTable
ALTER TABLE "training_participants" ADD COLUMN     "attendance" TEXT,
ADD COLUMN     "attendanceAt" TIMESTAMP(3),
ADD COLUMN     "attendanceBy" TEXT,
ADD COLUMN     "attendanceNote" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "dateOfBirth" TEXT,
ADD COLUMN     "guardianConsentAt" TIMESTAMP(3),
ADD COLUMN     "guardianConsentSentAt" TIMESTAMP(3),
ADD COLUMN     "guardianConsentToken" TEXT,
ADD COLUMN     "guardianEmail" TEXT,
ADD COLUMN     "guardianName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_guardianConsentToken_key" ON "users"("guardianConsentToken");

