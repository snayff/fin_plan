/*
  Warnings:

  - You are about to drop the column `dueMonth` on the `CommittedItem` table. All the data in the column will be lost.
  - You are about to drop the column `expectedMonth` on the `IncomeSource` table. All the data in the column will be lost.
  - `dueDate` is required on `IncomeSource` and `CommittedItem`. Rows are backfilled from the previous month column (defaulting to January of the current year when the source is null).

*/
-- AlterEnum
ALTER TYPE "AccountType" ADD VALUE 'Current' BEFORE 'Savings';

-- AlterTable: Account — add isCashflowLinked with default
ALTER TABLE "Account" ADD COLUMN     "isCashflowLinked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: IncomeSource — add nullable dueDate, backfill from expectedMonth, enforce NOT NULL, drop expectedMonth
ALTER TABLE "IncomeSource" ADD COLUMN "dueDate" DATE;
UPDATE "IncomeSource"
SET "dueDate" = make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, COALESCE("expectedMonth", 1), 1);
ALTER TABLE "IncomeSource" ALTER COLUMN "dueDate" SET NOT NULL;
ALTER TABLE "IncomeSource" DROP COLUMN "expectedMonth";

-- AlterTable: CommittedItem — add nullable dueDate, backfill from dueMonth, enforce NOT NULL, drop dueMonth
ALTER TABLE "CommittedItem" ADD COLUMN "dueDate" DATE;
UPDATE "CommittedItem"
SET "dueDate" = make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, COALESCE("dueMonth", 1), 1);
ALTER TABLE "CommittedItem" ALTER COLUMN "dueDate" SET NOT NULL;
ALTER TABLE "CommittedItem" DROP COLUMN "dueMonth";

-- AlterTable: DiscretionaryItem — add nullable dueDate (only used for one_off items, no backfill needed)
ALTER TABLE "DiscretionaryItem" ADD COLUMN "dueDate" DATE;

-- CreateIndex: add missing indexes already declared in schema
CREATE INDEX IF NOT EXISTS "CommittedItem_householdId_idx" ON "CommittedItem"("householdId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DiscretionaryItem_householdId_idx" ON "DiscretionaryItem"("householdId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GiftEvent_householdId_idx" ON "GiftEvent"("householdId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GiftPerson_householdId_idx" ON "GiftPerson"("householdId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IncomeSource_householdId_idx" ON "IncomeSource"("householdId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseItem_householdId_idx" ON "PurchaseItem"("householdId");
