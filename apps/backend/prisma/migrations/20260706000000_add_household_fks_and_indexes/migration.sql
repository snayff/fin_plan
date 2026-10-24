-- PERF-5 + RES-3: missing indexes and real household/member/user FK relations.
-- Purely additive: swaps the single-column balance indexes for composites that
-- serve "latest balance" (ORDER BY date DESC) queries, adds subcategory + device
-- FK-field indexes, and attaches proper FK constraints to every household-owned
-- table that previously stored a bare householdId string. Generated via
-- `prisma migrate diff` (schema-to-schema) to guarantee zero drift on deploy.

-- DropIndex
DROP INDEX "AssetBalance_assetId_idx";

-- DropIndex
DROP INDEX "AccountBalance_accountId_idx";

-- CreateIndex
CREATE INDEX "devices_user_id_idx" ON "devices"("user_id");

-- CreateIndex
CREATE INDEX "IncomeSource_subcategoryId_idx" ON "IncomeSource"("subcategoryId");

-- CreateIndex
CREATE INDEX "CommittedItem_subcategoryId_idx" ON "CommittedItem"("subcategoryId");

-- CreateIndex
CREATE INDEX "DiscretionaryItem_subcategoryId_idx" ON "DiscretionaryItem"("subcategoryId");

-- CreateIndex
CREATE INDEX "AssetBalance_assetId_date_idx" ON "AssetBalance"("assetId", "date");

-- CreateIndex
CREATE INDEX "AccountBalance_accountId_date_idx" ON "AccountBalance"("accountId", "date");

-- AddForeignKey
ALTER TABLE "HouseholdSettings" ADD CONSTRAINT "HouseholdSettings_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeSource" ADD CONSTRAINT "IncomeSource_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommittedItem" ADD CONSTRAINT "CommittedItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscretionaryItem" ADD CONSTRAINT "DiscretionaryItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerYearBudget" ADD CONSTRAINT "PlannerYearBudget_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftPlannerSettings" ADD CONSTRAINT "GiftPlannerSettings_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftPerson" ADD CONSTRAINT "GiftPerson_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftPerson" ADD CONSTRAINT "GiftPerson_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftEvent" ADD CONSTRAINT "GiftEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftAllocation" ADD CONSTRAINT "GiftAllocation_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftRolloverDismissal" ADD CONSTRAINT "GiftRolloverDismissal_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftRolloverDismissal" ADD CONSTRAINT "GiftRolloverDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSession" ADD CONSTRAINT "ReviewSession_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
