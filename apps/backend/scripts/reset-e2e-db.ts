// Truncates all user-data tables then runs seed-e2e.
// Refuses to run unless every safety gate in src/utils/reset-e2e-guard.ts passes
// (non-production NODE_ENV, explicit DB_RESET_ALLOWED=true, and a parsed
// DATABASE_URL whose host and database name match the local/test allow-list).
import { prisma } from "../src/config/database";
import { checkResetAllowed } from "../src/utils/reset-e2e-guard";

const check = checkResetAllowed(process.env);
if (!check.ok) {
  console.error(`reset-e2e-db refused: ${check.reason}`);
  process.exit(1);
}

async function main() {
  // Use TRUNCATE CASCADE — CASCADE handles FK constraint ordering automatically.
  // Tables with @@map use their mapped name; others use the Prisma default (PascalCase model name).
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "GiftRolloverDismissal",
      "GiftAllocation",
      "GiftEvent",
      "GiftPerson",
      "GiftPlannerSettings",
      "PlannerYearBudget",
      "PurchaseItem",
      "AccountBalance",
      "Account",
      "AssetBalance",
      "Asset",
      "item_amount_periods",
      "WaterfallHistory",
      "DiscretionaryItem",
      "CommittedItem",
      "IncomeSource",
      "Subcategory",
      "HouseholdSettings",
      "Snapshot",
      "import_backups",
      "ReviewSession",
      "audit_logs",
      "household_invites",
      "refresh_tokens",
      "devices",
      "members",
      "users",
      "households"
    RESTART IDENTITY CASCADE;
  `);
  console.log("reset-e2e-db: all user-data tables truncated");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
