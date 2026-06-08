-- Backfill nulls with default values
UPDATE "HouseholdSettings" SET "currentRatePct" = 0 WHERE "currentRatePct" IS NULL;
UPDATE "HouseholdSettings" SET "savingsRatePct" = 4 WHERE "savingsRatePct" IS NULL;
UPDATE "HouseholdSettings" SET "investmentRatePct" = 7 WHERE "investmentRatePct" IS NULL;
UPDATE "HouseholdSettings" SET "pensionRatePct" = 6 WHERE "pensionRatePct" IS NULL;

-- Make columns non-nullable with defaults
ALTER TABLE "HouseholdSettings" ALTER COLUMN "currentRatePct" SET NOT NULL,
                       ALTER COLUMN "currentRatePct" SET DEFAULT 0;

ALTER TABLE "HouseholdSettings" ALTER COLUMN "savingsRatePct" SET NOT NULL,
                       ALTER COLUMN "savingsRatePct" SET DEFAULT 4;

ALTER TABLE "HouseholdSettings" ALTER COLUMN "investmentRatePct" SET NOT NULL,
                       ALTER COLUMN "investmentRatePct" SET DEFAULT 7;

ALTER TABLE "HouseholdSettings" ALTER COLUMN "pensionRatePct" SET NOT NULL,
                       ALTER COLUMN "pensionRatePct" SET DEFAULT 6;
