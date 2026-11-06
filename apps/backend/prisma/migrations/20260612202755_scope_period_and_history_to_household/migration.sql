-- Scope ItemAmountPeriod and WaterfallHistory rows to their household.
-- The column is added as nullable first, backfilled from the owning waterfall
-- item, and only then made required, so the migration is safe on populated
-- databases.

-- ─── item_amount_periods ─────────────────────────────────────────────────────

-- AlterTable (nullable first; backfill below)
ALTER TABLE "item_amount_periods" ADD COLUMN "householdId" TEXT;

-- Backfill from the owning waterfall item
UPDATE "item_amount_periods" p
SET "householdId" = i."householdId"
FROM "IncomeSource" i
WHERE p."itemType" = 'income_source' AND p."itemId" = i."id";

UPDATE "item_amount_periods" p
SET "householdId" = c."householdId"
FROM "CommittedItem" c
WHERE p."itemType" = 'committed_item' AND p."itemId" = c."id";

UPDATE "item_amount_periods" p
SET "householdId" = d."householdId"
FROM "DiscretionaryItem" d
WHERE p."itemType" = 'discretionary_item' AND p."itemId" = d."id";

-- Remove rows whose owning item no longer exists (unreachable orphans)
DELETE FROM "item_amount_periods" WHERE "householdId" IS NULL;

ALTER TABLE "item_amount_periods" ALTER COLUMN "householdId" SET NOT NULL;

-- ─── WaterfallHistory ────────────────────────────────────────────────────────

-- AlterTable (nullable first; backfill below)
ALTER TABLE "WaterfallHistory" ADD COLUMN "householdId" TEXT;

-- Backfill from the owning waterfall item
UPDATE "WaterfallHistory" h
SET "householdId" = i."householdId"
FROM "IncomeSource" i
WHERE h."itemType" = 'income_source' AND h."itemId" = i."id";

UPDATE "WaterfallHistory" h
SET "householdId" = c."householdId"
FROM "CommittedItem" c
WHERE h."itemType" = 'committed_item' AND h."itemId" = c."id";

UPDATE "WaterfallHistory" h
SET "householdId" = d."householdId"
FROM "DiscretionaryItem" d
WHERE h."itemType" = 'discretionary_item' AND h."itemId" = d."id";

-- Remove rows whose owning item no longer exists (unreachable orphans)
DELETE FROM "WaterfallHistory" WHERE "householdId" IS NULL;

ALTER TABLE "WaterfallHistory" ALTER COLUMN "householdId" SET NOT NULL;

-- ─── Indexes & foreign keys ──────────────────────────────────────────────────

-- CreateIndex
CREATE INDEX "WaterfallHistory_householdId_idx" ON "WaterfallHistory"("householdId");

-- CreateIndex
CREATE INDEX "item_amount_periods_householdId_idx" ON "item_amount_periods"("householdId");

-- AddForeignKey
ALTER TABLE "WaterfallHistory" ADD CONSTRAINT "WaterfallHistory_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_amount_periods" ADD CONSTRAINT "item_amount_periods_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
