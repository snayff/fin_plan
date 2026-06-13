/**
 * Test database lifecycle helpers for journey tests.
 *
 * SECURITY: All destructive operations are guarded by NODE_ENV === "test".
 * These functions must NEVER be imported or used outside of test files.
 */

import { prisma } from "../../config/database";
import { hashPassword } from "../../utils/password";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Mirrors the Scenario type from scenario-builder without importing it,
 * to avoid circular dependency concerns. Uses structural typing.
 */
interface ScenarioShape {
  users: Array<{
    id: string;
    email: string;
    passwordHash: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    preferences: unknown;
    twoFactorEnabled: boolean;
    twoFactorSecret: string | null;
    activeHouseholdId?: string | null;
    [key: string]: unknown;
  }>;
  household: {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    [key: string]: unknown;
  };
  members: Array<{
    id: string;
    householdId: string;
    userId: string;
    name: string;
    role: "owner" | "admin" | "member";
    [key: string]: unknown;
  }>;
  settings: {
    id: string;
    householdId: string;
    [key: string]: unknown;
  };
  subcategories: Array<{
    id: string;
    householdId: string;
    tier: string;
    name: string;
    sortOrder: number;
    isLocked: boolean;
    isDefault: boolean;
    [key: string]: unknown;
  }>;
  incomeSources: Array<{
    id: string;
    householdId: string;
    subcategoryId: string;
    name: string;
    frequency: string;
    amount?: number;
    dueDate: Date;
    [key: string]: unknown;
  }>;
  committedItems: Array<{
    id: string;
    householdId: string;
    subcategoryId: string;
    name: string;
    spendType: string;
    amount?: number;
    dueDate: Date;
    [key: string]: unknown;
  }>;
  discretionaryItems: Array<{
    id: string;
    householdId: string;
    subcategoryId: string;
    name: string;
    spendType: string;
    amount?: number;
    [key: string]: unknown;
  }>;
  accounts: Array<{
    id: string;
    householdId: string;
    name: string;
    accountType?: string;
    type?: string;
    memberId?: string | null;
    ownerId?: string | null;
    [key: string]: unknown;
  }>;
  accountBalances: Array<{
    id: string;
    accountId: string;
    value: number;
    date: Date;
    [key: string]: unknown;
  }>;
  assets: Array<{
    id: string;
    householdId: string;
    name: string;
    assetType?: string;
    type?: string;
    memberId?: string | null;
    ownerId?: string | null;
    [key: string]: unknown;
  }>;
  assetBalances: Array<{
    id: string;
    assetId: string;
    value: number;
    date: Date;
    [key: string]: unknown;
  }>;
}

// ─── Environment Guard ──────────────────────────────────────────────────────

/**
 * Throws if not running in the test environment.
 * Called at the top of every destructive function.
 */
export function assertTestEnvironment(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Refusing to run destructive DB operation outside test environment");
  }
}

// ─── Table Truncation ───────────────────────────────────────────────────────

/**
 * All application tables in the database.
 *
 * Tables with @@map in schema use the mapped name; otherwise Prisma uses
 * the model name as-is for the Postgres table name.
 */
const ALL_TABLES = [
  // Auth & identity
  "audit_logs",
  "refresh_tokens",
  "revoked_access_tokens",
  "devices",
  // Planner — gifts
  "GiftAllocation",
  "GiftEvent",
  "GiftPerson",
  "GiftPlannerSettings",
  "GiftRolloverDismissal",
  // Planner — purchases & budgets
  "PurchaseItem",
  "PlannerYearBudget",
  // Waterfall items & history
  "item_amount_periods",
  "WaterfallHistory",
  "DiscretionaryItem",
  "CommittedItem",
  "IncomeSource",
  "Subcategory",
  // Assets & accounts
  "AccountBalance",
  "AssetBalance",
  "Account",
  "Asset",
  // Snapshots & sessions
  "Snapshot",
  "import_backups",
  "ReviewSession",
  // Household structure
  "HouseholdSettings",
  "household_invites",
  "members",
  // Core entities (must come last due to FK references)
  "households",
  "users",
] as const;

/**
 * Truncates all application tables, resetting the database to a clean state.
 * Uses a single TRUNCATE ... CASCADE statement to handle FK ordering.
 */
export async function truncateAllTables(): Promise<void> {
  assertTestEnvironment();

  const tableList = ALL_TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} CASCADE`);
}

// ─── Scenario Seeding ───────────────────────────────────────────────────────

/**
 * Map an asset type string from fixtures to the Prisma AssetType enum value.
 */
function toAssetType(raw: string): string {
  const map: Record<string, string> = {
    property: "Property",
    vehicle: "Vehicle",
    other: "Other",
  };
  return map[raw.toLowerCase()] ?? raw;
}

/**
 * Map an account type string from fixtures to the Prisma AccountType enum value.
 */
function toAccountType(raw: string): string {
  const map: Record<string, string> = {
    current: "Current",
    savings: "Savings",
    pension: "Pension",
    stocksandshares: "StocksAndShares",
    other: "Other",
  };
  return map[raw.toLowerCase()] ?? raw;
}

/**
 * Seeds a full scenario into the real database.
 *
 * Takes a scenario object as returned by `buildScenario()` and inserts all
 * entities respecting FK constraints. Returns the scenario unchanged for chaining.
 *
 * Note: fixture builders include an `amount` field on waterfall items for test
 * convenience. This function creates a corresponding ItemAmountPeriod row for
 * each item that has an amount.
 */
export async function seedScenario<T extends ScenarioShape>(scenario: T): Promise<T> {
  assertTestEnvironment();

  // 1. Users
  for (const user of scenario.users) {
    await prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        name: user.name,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        preferences: (user.preferences as object) ?? {},
        twoFactorEnabled: user.twoFactorEnabled,
        twoFactorSecret: user.twoFactorSecret,
        // activeHouseholdId set after household exists
      },
    });
  }

  // 2. Households
  await prisma.household.create({
    data: {
      id: scenario.household.id,
      name: scenario.household.name,
      createdAt: scenario.household.createdAt,
      updatedAt: scenario.household.updatedAt,
    },
  });

  // Link users to their active household now that it exists
  for (const user of scenario.users) {
    if (user.activeHouseholdId) {
      await prisma.user.update({
        where: { id: user.id },
        data: { activeHouseholdId: user.activeHouseholdId },
      });
    }
  }

  // 3. Members
  for (const member of scenario.members) {
    await prisma.member.create({
      data: {
        id: member.id,
        householdId: member.householdId,
        userId: member.userId,
        name: member.name,
        role: member.role,
      },
    });
  }

  // 4. Household settings
  await prisma.householdSettings.create({
    data: {
      id: scenario.settings.id,
      householdId: scenario.settings.householdId,
      surplusBenchmarkPct: (scenario.settings.surplusBenchmarkPct as number) ?? 10,
      isaAnnualLimit: (scenario.settings.isaAnnualLimit as number) ?? 20000,
      isaYearStartMonth: (scenario.settings.isaYearStartMonth as number) ?? 4,
      isaYearStartDay: (scenario.settings.isaYearStartDay as number) ?? 6,
      stalenessThresholds: (scenario.settings.stalenessThresholds as object) ?? {},
    },
  });

  // 5. Subcategories
  for (const sub of scenario.subcategories) {
    await prisma.subcategory.create({
      data: {
        id: sub.id,
        householdId: sub.householdId,
        tier: sub.tier as "income" | "committed" | "discretionary",
        name: sub.name,
        sortOrder: sub.sortOrder,
        isLocked: sub.isLocked,
        isDefault: sub.isDefault,
      },
    });
  }

  // 6. Income sources + amount periods
  for (const inc of scenario.incomeSources) {
    await prisma.incomeSource.create({
      data: {
        id: inc.id,
        householdId: inc.householdId,
        subcategoryId: inc.subcategoryId,
        name: inc.name,
        frequency: inc.frequency as "monthly" | "annual" | "one_off",
        incomeType:
          (inc.incomeType as
            | "salary"
            | "dividends"
            | "freelance"
            | "rental"
            | "benefits"
            | "other") ?? "other",
        dueDate: inc.dueDate,
        memberId: (inc.memberId as string) ?? (inc.ownerId as string) ?? null,
        sortOrder: (inc.sortOrder as number) ?? 0,
        notes: (inc.notes as string) ?? null,
      },
    });

    if (inc.amount !== undefined) {
      await prisma.itemAmountPeriod.create({
        data: {
          householdId: inc.householdId,
          itemType: "income_source",
          itemId: inc.id,
          startDate: inc.dueDate,
          amount: inc.amount,
        },
      });
    }
  }

  // Committed items + amount periods
  for (const ci of scenario.committedItems) {
    await prisma.committedItem.create({
      data: {
        id: ci.id,
        householdId: ci.householdId,
        subcategoryId: ci.subcategoryId,
        name: ci.name,
        spendType: ci.spendType as "monthly" | "yearly" | "one_off",
        notes: (ci.notes as string) ?? null,
        memberId: (ci.memberId as string) ?? (ci.ownerId as string) ?? null,
        dueDate: ci.dueDate,
        sortOrder: (ci.sortOrder as number) ?? 0,
      },
    });

    if (ci.amount !== undefined) {
      await prisma.itemAmountPeriod.create({
        data: {
          householdId: ci.householdId,
          itemType: "committed_item",
          itemId: ci.id,
          startDate: ci.dueDate,
          amount: ci.amount,
        },
      });
    }
  }

  // Discretionary items + amount periods
  for (const di of scenario.discretionaryItems) {
    await prisma.discretionaryItem.create({
      data: {
        id: di.id,
        householdId: di.householdId,
        subcategoryId: di.subcategoryId,
        name: di.name,
        spendType: di.spendType as "monthly" | "yearly" | "one_off",
        notes: (di.notes as string) ?? null,
        memberId: ((di as Record<string, unknown>).memberId as string | null) ?? null,
        sortOrder: (di.sortOrder as number) ?? 0,
      },
    });

    if (di.amount !== undefined) {
      await prisma.itemAmountPeriod.create({
        data: {
          householdId: di.householdId,
          itemType: "discretionary_item",
          itemId: di.id,
          startDate: di.dueDate ?? new Date("2026-01-01"),
          amount: di.amount,
        },
      });
    }
  }

  // 7. Accounts
  for (const acc of scenario.accounts) {
    const typeRaw = acc.type ?? acc.accountType ?? "Current";
    await prisma.account.create({
      data: {
        id: acc.id,
        householdId: acc.householdId,
        name: acc.name,
        type: toAccountType(typeRaw) as
          | "Current"
          | "Savings"
          | "Pension"
          | "StocksAndShares"
          | "Other",
        memberId: acc.memberId ?? (acc.ownerId as string) ?? null,
        isCashflowLinked: (acc.isCashflowLinked as boolean) ?? false,
      },
    });
  }

  // Assets
  for (const asset of scenario.assets) {
    const typeRaw = asset.type ?? asset.assetType ?? "Other";
    await prisma.asset.create({
      data: {
        id: asset.id,
        householdId: asset.householdId,
        name: asset.name,
        type: toAssetType(typeRaw) as "Property" | "Vehicle" | "Other",
        memberId: asset.memberId ?? (asset.ownerId as string) ?? null,
        growthRatePct: (asset.growthRatePct as number) ?? null,
      },
    });
  }

  // 8. Account balances
  for (const ab of scenario.accountBalances) {
    await prisma.accountBalance.create({
      data: {
        id: ab.id,
        accountId: ab.accountId,
        value: ab.value,
        date: ab.date,
        note: (ab.note as string) ?? null,
      },
    });
  }

  // Asset balances
  for (const ab of scenario.assetBalances) {
    await prisma.assetBalance.create({
      data: {
        id: ab.id,
        assetId: ab.assetId,
        value: ab.value,
        date: ab.date,
        note: (ab.note as string) ?? null,
      },
    });
  }

  return scenario;
}

// ─── User Seeding ───────────────────────────────────────────────────────────

// ─── Lightweight Household Factory ─────────────────────────────────────────

/**
 * Creates a minimal household record (no users/members/settings) for schema-level tests.
 * Returns the created household.
 */
export async function createTestHousehold(): Promise<{ id: string; name: string }> {
  assertTestEnvironment();

  const household = await prisma.household.create({
    data: { name: `Test Household ${Date.now()}` },
  });

  return { id: household.id, name: household.name };
}

// ─── User Seeding ───────────────────────────────────────────────────────────

/**
 * Creates a real user with a properly hashed password.
 * Intended for journey tests that authenticate via the real login endpoint.
 */
export async function seedUser(
  email: string,
  password: string
): Promise<{ userId: string; email: string }> {
  assertTestEnvironment();

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: email.split("@")[0] ?? "Test User",
    },
  });

  return { userId: user.id, email: user.email };
}
