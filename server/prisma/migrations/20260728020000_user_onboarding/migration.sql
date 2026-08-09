-- AlterTable
ALTER TABLE "users" ADD COLUMN     "onboarding" JSONB,
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3);

