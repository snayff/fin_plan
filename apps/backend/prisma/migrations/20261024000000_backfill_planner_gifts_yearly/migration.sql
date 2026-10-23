-- Data-only backfill for #219.
--
-- The Gift Planner's synced discretionary item stores the *annual* gift budget
-- as its period amount. Before #107 it was created with spendType 'monthly',
-- so the waterfall deducted the full annual budget every month (~12x). #107
-- fixed creation only; this corrects synced items created before that fix.
UPDATE "DiscretionaryItem"
SET "spendType" = 'yearly'
WHERE "isPlannerOwned" = true
  AND "spendType" = 'monthly';
