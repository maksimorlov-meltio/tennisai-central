-- CreateTable
CREATE TABLE "calendar_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "federations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "showOwnEvents" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_preferences_userId_key" ON "calendar_preferences"("userId");

-- AddForeignKey
ALTER TABLE "calendar_preferences" ADD CONSTRAINT "calendar_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
