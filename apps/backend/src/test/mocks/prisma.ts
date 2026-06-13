import { mock } from "bun:test";

function buildModelMock() {
  return {
    findUnique: mock(() => {}),
    findFirst: mock(() => {}),
    findMany: mock(() => {}),
    create: mock(() => {}),
    createMany: mock(() => {}),
    update: mock(() => {}),
    upsert: mock(() => {}),
    updateMany: mock(() => {}),
    delete: mock(() => {}),
    deleteMany: mock(() => {}),
    count: mock(() => {}),
    aggregate: mock(() => {}),
    groupBy: mock(() => {}),
  };
}

export const prismaMock = {
  auditLog: buildModelMock(),
  refreshToken: buildModelMock(),
  revokedAccessToken: buildModelMock(),
  user: buildModelMock(),
  household: buildModelMock(),
  member: buildModelMock(),
  householdInvite: buildModelMock(),
  householdSettings: buildModelMock(),
  device: buildModelMock(),
  incomeSource: buildModelMock(),
  committedItem: buildModelMock(),
  discretionaryItem: buildModelMock(),
  waterfallHistory: buildModelMock(),
  itemAmountPeriod: buildModelMock(),
  asset: buildModelMock(),
  assetBalance: buildModelMock(),
  account: buildModelMock(),
  accountBalance: buildModelMock(),
  purchaseItem: buildModelMock(),
  plannerYearBudget: buildModelMock(),
  giftPerson: buildModelMock(),
  giftEvent: buildModelMock(),
  giftAllocation: buildModelMock(),
  giftPlannerSettings: buildModelMock(),
  giftRolloverDismissal: buildModelMock(),
  subcategory: buildModelMock(),
  snapshot: buildModelMock(),
  reviewSession: buildModelMock(),
  importBackup: buildModelMock(),
  // Interactive transaction support: passes self so tx.model.method() resolves to same mocks
  $transaction: mock((fn: (tx: any) => any) => fn(prismaMock)),
  $queryRaw: mock(() => {}),
  $disconnect: mock(() => {}),
};

/** Reset all mocks on the prisma mock object */
export function resetPrismaMocks() {
  for (const [key, value] of Object.entries(prismaMock)) {
    if (typeof value === "function") {
      (value as any).mockReset();
    } else if (typeof value === "object" && value !== null) {
      for (const fn of Object.values(value)) {
        if (typeof fn === "function") {
          (fn as any).mockReset();
        }
      }
    }
  }
  // Restore $transaction default behavior
  prismaMock.$transaction.mockImplementation((fn: (tx: any) => any) => fn(prismaMock));
}
