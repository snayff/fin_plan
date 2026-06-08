-- CreateEnum
CREATE TYPE "GiftDateType" AS ENUM ('shared', 'personal');

-- CreateEnum
CREATE TYPE "GiftAllocationStatus" AS ENUM ('planned', 'bought', 'skipped');

-- CreateEnum
CREATE TYPE "GiftPlannerMode" AS ENUM ('synced', 'independent');

-- DropForeignKey
ALTER TABLE "GiftEvent" DROP CONSTRAINT "GiftEvent_giftPersonId_fkey";

-- DropForeignKey
ALTER TABLE "GiftYearRecord" DROP CONSTRAINT "GiftYearRecord_giftEventId_fkey";

-- AlterTable
ALTER TABLE "DiscretionaryItem" ADD COLUMN     "isPlannerOwned" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "GiftEvent" DROP COLUMN "customName",
DROP COLUMN "eventType",
DROP COLUMN "giftPersonId",
DROP COLUMN "recurrence",
DROP COLUMN "specificDate",
ADD COLUMN     "dateType" "GiftDateType" NOT NULL,
ADD COLUMN     "isLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GiftPerson" ADD COLUMN     "memberId" TEXT;

-- AlterTable
ALTER TABLE "Subcategory" ADD COLUMN     "lockedByPlanner" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "GiftYearRecord";

-- DropEnum
DROP TYPE "GiftEventType";

-- DropEnum
DROP TYPE "GiftRecurrence";

-- CreateTable
CREATE TABLE "GiftPlannerSettings" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "mode" "GiftPlannerMode" NOT NULL DEFAULT 'synced',
    "syncedDiscretionaryItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftPlannerSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftAllocation" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "giftPersonId" TEXT NOT NULL,
    "giftEventId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "planned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "spent" DOUBLE PRECISION,
    "status" "GiftAllocationStatus" NOT NULL DEFAULT 'planned',
    "notes" TEXT,
    "dateMonth" INTEGER,
    "dateDay" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftRolloverDismissal" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftRolloverDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GiftPlannerSettings_householdId_key" ON "GiftPlannerSettings"("householdId");

-- CreateIndex
CREATE INDEX "GiftAllocation_householdId_year_idx" ON "GiftAllocation"("householdId", "year");

-- CreateIndex
CREATE INDEX "GiftAllocation_giftEventId_year_idx" ON "GiftAllocation"("giftEventId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "GiftAllocation_giftPersonId_giftEventId_year_key" ON "GiftAllocation"("giftPersonId", "giftEventId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "GiftRolloverDismissal_householdId_userId_year_key" ON "GiftRolloverDismissal"("householdId", "userId", "year");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CommittedItem_householdId_idx" ON "CommittedItem"("householdId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DiscretionaryItem_householdId_idx" ON "DiscretionaryItem"("householdId");

-- CreateIndex
CREATE INDEX "GiftEvent_householdId_idx" ON "GiftEvent"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "GiftEvent_householdId_name_key" ON "GiftEvent"("householdId", "name");

-- CreateIndex
CREATE INDEX "GiftPerson_householdId_idx" ON "GiftPerson"("householdId");

-- CreateIndex
CREATE INDEX "GiftPerson_memberId_idx" ON "GiftPerson"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "GiftPerson_householdId_name_key" ON "GiftPerson"("householdId", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IncomeSource_householdId_idx" ON "IncomeSource"("householdId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseItem_householdId_idx" ON "PurchaseItem"("householdId");

-- AddForeignKey
ALTER TABLE "GiftAllocation" ADD CONSTRAINT "GiftAllocation_giftPersonId_fkey" FOREIGN KEY ("giftPersonId") REFERENCES "GiftPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftAllocation" ADD CONSTRAINT "GiftAllocation_giftEventId_fkey" FOREIGN KEY ("giftEventId") REFERENCES "GiftEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
