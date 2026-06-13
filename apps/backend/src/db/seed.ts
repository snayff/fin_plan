import { prisma } from "../config/database";
import { hashPassword } from "../utils/password";
import { subcategoryService } from "../services/subcategory.service";

if (process.env.NODE_ENV === "production") {
  console.log("Seed skipped in production");
  process.exit(0);
}

type WaterfallModel = "incomeSource" | "committedItem" | "discretionaryItem";
type WaterfallItemType = "income_source" | "committed_item" | "discretionary_item";

async function createItemWithPeriod(
  model: WaterfallModel,
  itemType: WaterfallItemType,
  householdId: string,
  data: Record<string, unknown>,
  amount: number
) {
  const existing = await (prisma[model] as any).findFirst({
    where: { householdId, name: data.name },
  });
  if (existing) return existing;

  const item = await (prisma[model] as any).create({
    data: { householdId, ...data },
  });

  await prisma.itemAmountPeriod.create({
    data: {
      householdId,
      itemType,
      itemId: item.id,
      startDate: new Date(),
      amount,
    },
  });

  return item;
}

async function main() {
  const email = "owner@finplan.test";
  const password = "BrowserTest123!";

  // ─── User & Household ──────────────────────────────────────────────────────

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      name: "Test Owner",
    },
    update: { passwordHash, name: "Test Owner" },
  });

  const household = await prisma.household.upsert({
    where: { id: user.activeHouseholdId ?? "seed-household" },
    create: {
      name: "Test Household",
      memberProfiles: {
        create: { userId: user.id, name: user.name ?? "Test Owner", role: "owner" },
      },
    },
    update: {},
  });

  // Update active household
  await prisma.user.update({
    where: { id: user.id },
    data: { activeHouseholdId: household.id },
  });

  const hId = household.id;

  // Get the owner's Member record (needed for memberId references)
  const ownerMember = await prisma.member.findFirst({
    where: { householdId: hId, userId: user.id },
  });

  // ─── Household Settings ────────────────────────────────────────────────────

  await prisma.householdSettings.upsert({
    where: { householdId: hId },
    create: { householdId: hId },
    update: {},
  });

  // ─── Subcategories ─────────────────────────────────────────────────────────

  await subcategoryService.seedDefaults(hId);

  const incomeSalaryId = await subcategoryService.getSubcategoryIdByName(hId, "income", "Salary");
  const committedOtherId = await subcategoryService.getSubcategoryIdByName(
    hId,
    "committed",
    "Other"
  );
  const discretionaryFoodId = await subcategoryService.getSubcategoryIdByName(
    hId,
    "discretionary",
    "Food"
  );
  const discretionarySavingsId = await subcategoryService.getSubcategoryIdByName(
    hId,
    "discretionary",
    "Savings"
  );

  if (!incomeSalaryId || !committedOtherId || !discretionaryFoodId || !discretionarySavingsId) {
    throw new Error("Failed to resolve subcategory IDs for seeding");
  }

  // ─── Income Sources ────────────────────────────────────────────────────────

  await createItemWithPeriod(
    "incomeSource",
    "income_source",
    hId,
    {
      name: "Alice Salary",
      frequency: "monthly" as const,
      incomeType: "salary" as const,
      subcategoryId: incomeSalaryId,
      memberId: ownerMember?.id ?? null,
      sortOrder: 0,
      dueDate: new Date("2026-01-25"),
    },
    3500
  );

  await createItemWithPeriod(
    "incomeSource",
    "income_source",
    hId,
    {
      name: "Bob Salary",
      frequency: "monthly" as const,
      incomeType: "salary" as const,
      subcategoryId: incomeSalaryId,
      sortOrder: 1,
      dueDate: new Date("2026-01-28"),
    },
    2800
  );

  // ─── Committed Items (monthly) ─────────────────────────────────────────────

  const committedMonthly = [
    {
      name: "Rent",
      spendType: "monthly" as const,
      sortOrder: 0,
      amount: 1200,
      dueDate: new Date("2026-01-01"),
    },
    {
      name: "Internet",
      spendType: "monthly" as const,
      sortOrder: 1,
      amount: 45,
      dueDate: new Date("2026-01-01"),
    },
    {
      name: "Phone",
      spendType: "monthly" as const,
      sortOrder: 2,
      amount: 25,
      dueDate: new Date("2026-01-01"),
    },
  ];

  for (const { amount, ...item } of committedMonthly) {
    await createItemWithPeriod(
      "committedItem",
      "committed_item",
      hId,
      { subcategoryId: committedOtherId, ...item },
      amount
    );
  }

  // ─── Committed Items (yearly) ──────────────────────────────────────────────

  const committedYearly = [
    {
      name: "Home Insurance",
      spendType: "yearly" as const,
      dueDate: new Date("2026-09-01"),
      sortOrder: 0,
      amount: 600,
    },
    {
      name: "Car Tax",
      spendType: "yearly" as const,
      dueDate: new Date("2026-03-01"),
      sortOrder: 1,
      amount: 180,
    },
  ];

  for (const { amount, ...item } of committedYearly) {
    await createItemWithPeriod(
      "committedItem",
      "committed_item",
      hId,
      { subcategoryId: committedOtherId, ...item },
      amount
    );
  }

  // ─── Discretionary Items ───────────────────────────────────────────────────

  const discretionary = [
    { name: "Groceries", spendType: "monthly" as const, sortOrder: 0, amount: 500 },
    { name: "Dining Out", spendType: "monthly" as const, sortOrder: 1, amount: 150 },
    { name: "Entertainment", spendType: "monthly" as const, sortOrder: 2, amount: 80 },
  ];

  for (const { amount, ...item } of discretionary) {
    await createItemWithPeriod(
      "discretionaryItem",
      "discretionary_item",
      hId,
      { subcategoryId: discretionaryFoodId, ...item },
      amount
    );
  }

  // ─── Savings Allocations ───────────────────────────────────────────────────

  await createItemWithPeriod(
    "discretionaryItem",
    "discretionary_item",
    hId,
    {
      name: "Emergency Fund",
      spendType: "monthly" as const,
      subcategoryId: discretionarySavingsId,
      sortOrder: 0,
    },
    200
  );

  console.log(`Seed complete: user=${email}, household=${household.name} (${hId})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
