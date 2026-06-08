// Truncates all user-data tables then runs seed-e2e.
// Refuses to run if NODE_ENV=production OR DATABASE_URL doesn't contain "test" or "dev".
import { prisma } from "../src/config/database";

if (process.env.NODE_ENV === "production") {
  console.error("reset-e2e-db refused: NODE_ENV=production");
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL ?? "";
if (!/_test|_dev|finplan_e2e/.test(dbUrl)) {
  console.error(
    `reset-e2e-db refused: DATABASE_URL does not look like a test database (${dbUrl})`
  );
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
