-- Squashed migration: replaces add_member_model + remove_household_member_model + rename_asset_account_member_ref
-- Introduces the standalone Member entity, migrates data from household_members, and updates all FK references.

-- Step 1: Create members table
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "role" "HouseholdRole" NOT NULL DEFAULT 'member',
    "date_of_birth" TIMESTAMP(3),
    "retirement_year" INTEGER,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "members_household_id_idx" ON "members"("household_id");
CREATE INDEX "members_user_id_idx" ON "members"("user_id");
CREATE UNIQUE INDEX "members_household_id_user_id_key" ON "members"("household_id", "user_id");

ALTER TABLE "members" ADD CONSTRAINT "members_household_id_fkey"
    FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 2: Copy household_members → members (data migration)
INSERT INTO "members" ("id", "household_id", "user_id", "name", "role", "date_of_birth", "retirement_year", "joined_at", "updated_at")
SELECT
    gen_random_uuid()::text,
    hm."household_id",
    hm."user_id",
    u."name",
    hm."role",
    hm."dateOfBirth",
    hm."retirementYear",
    hm."joined_at",
    NOW()
FROM "household_members" hm
JOIN "users" u ON u."id" = hm."user_id";

-- Step 3: Update ownerId/memberUserId references from User.id → Member.id
UPDATE "IncomeSource" is_
SET "ownerId" = m."id"
FROM "members" m
WHERE m."household_id" = is_."householdId"
  AND m."user_id" = is_."ownerId"
  AND is_."ownerId" IS NOT NULL;

UPDATE "CommittedItem" ci
SET "ownerId" = m."id"
FROM "members" m
WHERE m."household_id" = ci."householdId"
  AND m."user_id" = ci."ownerId"
  AND ci."ownerId" IS NOT NULL;

UPDATE "Asset" a
SET "memberUserId" = m."id"
FROM "members" m
WHERE m."household_id" = a."householdId"
  AND m."user_id" = a."memberUserId"
  AND a."memberUserId" IS NOT NULL;

UPDATE "Account" acc
SET "memberUserId" = m."id"
FROM "members" m
WHERE m."household_id" = acc."householdId"
  AND m."user_id" = acc."memberUserId"
  AND acc."memberUserId" IS NOT NULL;

-- Step 4: Drop household_members
ALTER TABLE "household_members" DROP CONSTRAINT "household_members_household_id_fkey";
ALTER TABLE "household_members" DROP CONSTRAINT "household_members_user_id_fkey";
DROP TABLE "household_members";

-- Step 5: Rename Asset/Account columns
ALTER TABLE "Asset" RENAME COLUMN "memberUserId" TO "memberId";
ALTER TABLE "Account" RENAME COLUMN "memberUserId" TO "memberId";

-- Step 6: Add FKs + indexes for memberId
CREATE INDEX "Asset_memberId_idx" ON "Asset"("memberId");
CREATE INDEX "Account_memberId_idx" ON "Account"("memberId");

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
