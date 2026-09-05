-- AlterTable
ALTER TABLE "equipment_items" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "finance_entries" ADD COLUMN     "tournamentId" TEXT,
ALTER COLUMN "currency" SET DEFAULT 'EUR';

-- CreateTable
CREATE TABLE "equipment_products" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT '',
    "releaseYear" INTEGER,
    "msrpEur" DOUBLE PRECISION,
    "imageUrl" TEXT,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "racket_specs" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "headSizeCm2" INTEGER NOT NULL,
    "headSizeIn2" INTEGER NOT NULL,
    "lengthCm" DOUBLE PRECISION NOT NULL,
    "unstrungWeightG" INTEGER NOT NULL,
    "strungWeightG" INTEGER,
    "balanceMm" INTEGER NOT NULL,
    "balancePtsHL" INTEGER,
    "swingweight" INTEGER,
    "stiffnessRa" INTEGER,
    "beamMm" TEXT NOT NULL,
    "stringPatternMains" INTEGER NOT NULL,
    "stringPatternCrosses" INTEGER NOT NULL,
    "recommendedTensionMinKg" DOUBLE PRECISION NOT NULL,
    "recommendedTensionMaxKg" DOUBLE PRECISION NOT NULL,
    "composition" TEXT,
    "gripSizes" TEXT[],
    "targetLevel" TEXT NOT NULL,

    CONSTRAINT "racket_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "string_specs" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "gaugeMm" DOUBLE PRECISION NOT NULL,
    "gaugeLabel" TEXT NOT NULL,
    "shape" TEXT NOT NULL,
    "coating" TEXT,
    "colour" TEXT,
    "power" INTEGER NOT NULL,
    "control" INTEGER NOT NULL,
    "spin" INTEGER NOT NULL,
    "comfort" INTEGER NOT NULL,
    "durability" INTEGER NOT NULL,
    "tensionMaintenance" INTEGER NOT NULL,
    "recommendedTensionMinKg" DOUBLE PRECISION NOT NULL,
    "recommendedTensionMaxKg" DOUBLE PRECISION NOT NULL,
    "hybridPartnerNote" TEXT,

    CONSTRAINT "string_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shoe_specs" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "courtType" TEXT NOT NULL,
    "weightG" INTEGER NOT NULL,
    "dropMm" INTEGER,
    "widthFit" TEXT NOT NULL,
    "cushioning" TEXT NOT NULL,
    "stability" TEXT NOT NULL,
    "outsoleGuaranteeMonths" INTEGER,
    "sizesEu" TEXT[],

    CONSTRAINT "shoe_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessory_specs" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,

    CONSTRAINT "accessory_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "string_setups" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "racketItemId" TEXT NOT NULL,
    "mainsProductId" TEXT,
    "crossesProductId" TEXT,
    "mainsCustomName" TEXT,
    "crossesCustomName" TEXT,
    "tensionMainsKg" DOUBLE PRECISION NOT NULL,
    "tensionCrossesKg" DOUBLE PRECISION,
    "prestretch" BOOLEAN,
    "strungAt" TIMESTAMP(3) NOT NULL,
    "stringerName" TEXT,
    "costEur" DOUBLE PRECISION,
    "hoursPlayed" DOUBLE PRECISION,
    "retiredAt" TIMESTAMP(3),
    "retiredReason" TEXT,
    "comfortNote" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "string_setups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "equipment_products_category_brand_idx" ON "equipment_products"("category", "brand");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_products_brand_model_variant_key" ON "equipment_products"("brand", "model", "variant");

-- CreateIndex
CREATE UNIQUE INDEX "racket_specs_productId_key" ON "racket_specs"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "string_specs_productId_key" ON "string_specs"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "shoe_specs_productId_key" ON "shoe_specs"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "accessory_specs_productId_key" ON "accessory_specs"("productId");

-- CreateIndex
CREATE INDEX "string_setups_playerId_strungAt_idx" ON "string_setups"("playerId", "strungAt");

-- CreateIndex
CREATE INDEX "string_setups_racketItemId_idx" ON "string_setups"("racketItemId");

-- CreateIndex
CREATE INDEX "equipment_items_productId_idx" ON "equipment_items"("productId");

-- CreateIndex
CREATE INDEX "finance_entries_tournamentId_idx" ON "finance_entries"("tournamentId");

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_items" ADD CONSTRAINT "equipment_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "equipment_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "racket_specs" ADD CONSTRAINT "racket_specs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "equipment_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "string_specs" ADD CONSTRAINT "string_specs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "equipment_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shoe_specs" ADD CONSTRAINT "shoe_specs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "equipment_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_specs" ADD CONSTRAINT "accessory_specs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "equipment_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "string_setups" ADD CONSTRAINT "string_setups_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "string_setups" ADD CONSTRAINT "string_setups_racketItemId_fkey" FOREIGN KEY ("racketItemId") REFERENCES "equipment_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "string_setups" ADD CONSTRAINT "string_setups_mainsProductId_fkey" FOREIGN KEY ("mainsProductId") REFERENCES "equipment_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "string_setups" ADD CONSTRAINT "string_setups_crossesProductId_fkey" FOREIGN KEY ("crossesProductId") REFERENCES "equipment_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
