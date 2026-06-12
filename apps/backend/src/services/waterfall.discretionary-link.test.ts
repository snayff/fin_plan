import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { prisma } from "../config/database.js";
import { waterfallService } from "./waterfall.service.js";
import type { ActorCtx } from "./audit.service.js";
import { createTestHousehold } from "../test/helpers/test-db.js";

describe("waterfallService — linkedAccountId", () => {
  let householdId: string;
  let savingsSubId: string;
  let otherSubId: string;
  let savingsAccountId: string;
  let currentAccountId: string;
  let ctx: ActorCtx;

  beforeEach(async () => {
    const hh = await createTestHousehold();
    householdId = hh.id;
    ctx = {
      householdId,
      actorId: "test-user",
      actorName: "Test User",
      ipAddress: null,
      userAgent: null,
    };
    savingsSubId = (
      await prisma.subcategory.create({
        data: { householdId, tier: "discretionary", name: "Savings", sortOrder: 0, isLocked: true },
      })
    ).id;
    otherSubId = (
      await prisma.subcategory.create({
        data: { householdId, tier: "discretionary", name: "Other", sortOrder: 1 },
      })
    ).id;
    savingsAccountId = (
      await prisma.account.create({
        data: { householdId, name: "ISA", type: "Savings" },
      })
    ).id;
    currentAccountId = (
      await prisma.account.create({
        data: { householdId, name: "Current", type: "Current" },
      })
    ).id;
  });

  afterEach(async () => {
    await prisma.household.delete({ where: { id: householdId } });
  });

  it("accepts linkedAccountId when item is in Savings subcategory and account is Savings/S&S/Pension", async () => {
    const item = await waterfallService.createDiscretionary(
      householdId,
      {
        name: "ISA top-up",
        amount: 250,
        subcategoryId: savingsSubId,
        spendType: "monthly",
        linkedAccountId: savingsAccountId,
      } as any,
      ctx
    );
    expect((item as any).linkedAccountId).toBe(savingsAccountId);
  });

  it("rejects linking when subcategory is not Savings", async () => {
    let threw = false;
    try {
      await waterfallService.createDiscretionary(
        householdId,
        {
          name: "Not savings",
          amount: 50,
          subcategoryId: otherSubId,
          spendType: "monthly",
          linkedAccountId: savingsAccountId,
        } as any,
        ctx
      );
    } catch (e: any) {
      threw = true;
      expect(e.message).toMatch(/Savings subcategory/);
    }
    expect(threw).toBe(true);
  });

  it("rejects linking to a Current account", async () => {
    let threw = false;
    try {
      await waterfallService.createDiscretionary(
        householdId,
        {
          name: "x",
          amount: 10,
          subcategoryId: savingsSubId,
          spendType: "monthly",
          linkedAccountId: currentAccountId,
        } as any,
        ctx
      );
    } catch (e: any) {
      threw = true;
      expect(e.message).toMatch(/Savings, StocksAndShares, or Pension/);
    }
    expect(threw).toBe(true);
  });

  it("rejects linking to an account not in this household", async () => {
    // Use a non-existent account ID — same validation path as a cross-household account
    // (both fail the householdId-scoped findFirst → NotFoundError)
    const nonExistentAccountId = "cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    let threw = false;
    try {
      await waterfallService.createDiscretionary(
        householdId,
        {
          name: "x",
          amount: 10,
          subcategoryId: savingsSubId,
          spendType: "monthly",
          linkedAccountId: nonExistentAccountId,
        } as any,
        ctx
      );
    } catch (e: any) {
      threw = true;
      expect(e.message).toMatch(/not found/i);
    }
    expect(threw).toBe(true);
  });

  it("rejects linking on a planner-owned item (update)", async () => {
    const plannerItem = await prisma.discretionaryItem.create({
      data: { householdId, subcategoryId: savingsSubId, name: "Gift plan", isPlannerOwned: true },
    });
    let threw = false;
    try {
      await waterfallService.updateDiscretionary(
        householdId,
        plannerItem.id,
        {
          linkedAccountId: savingsAccountId,
        } as any,
        ctx
      );
    } catch (e: any) {
      threw = true;
      expect(e.message).toMatch(/planner/i);
    }
    expect(threw).toBe(true);
  });

  it("listDiscretionary returns linkedAccount summary { id, name, type } for linked items", async () => {
    const item = await waterfallService.createDiscretionary(
      householdId,
      {
        name: "ISA top-up",
        amount: 250,
        subcategoryId: savingsSubId,
        spendType: "monthly",
        linkedAccountId: savingsAccountId,
      } as any,
      ctx
    );
    const items = await waterfallService.listDiscretionary(householdId);
    const found = items.find((i: any) => i.id === (item as any).id);
    expect(found?.linkedAccount).toEqual({
      id: savingsAccountId,
      name: "ISA",
      type: "Savings",
    });
  });

  it("listDiscretionary returns linkedAccount null for unlinked items", async () => {
    const item = await waterfallService.createDiscretionary(
      householdId,
      {
        name: "Misc spend",
        amount: 50,
        subcategoryId: otherSubId,
        spendType: "monthly",
      } as any,
      ctx
    );
    const items = await waterfallService.listDiscretionary(householdId);
    const found = items.find((i: any) => i.id === (item as any).id);
    expect(found?.linkedAccount).toBeNull();
  });

  it("createSavings accepts a link to an account in the same household", async () => {
    const item = await waterfallService.createSavings(
      householdId,
      {
        name: "ISA allocation",
        amount: 100,
        subcategoryId: savingsSubId,
        spendType: "monthly",
        linkedAccountId: savingsAccountId,
      } as any,
      ctx
    );
    expect((item as any).linkedAccountId).toBe(savingsAccountId);
  });

  it("createSavings rejects a link to an account in a different household", async () => {
    const foreign = await createTestHousehold();
    const foreignAccount = await prisma.account.create({
      data: { householdId: foreign.id, name: "Foreign ISA", type: "Savings" },
    });
    try {
      let threw = false;
      try {
        await waterfallService.createSavings(
          householdId,
          {
            name: "Bad link",
            amount: 100,
            subcategoryId: savingsSubId,
            spendType: "monthly",
            linkedAccountId: foreignAccount.id,
          } as any,
          ctx
        );
      } catch (e: any) {
        threw = true;
        expect(e.message).toMatch(/not found/i);
      }
      expect(threw).toBe(true);
      const created = await prisma.discretionaryItem.findFirst({
        where: { householdId, name: "Bad link" },
      });
      expect(created).toBeNull();
    } finally {
      await prisma.household.delete({ where: { id: foreign.id } });
    }
  });

  it("createSavings rejects a link to a Current account", async () => {
    let threw = false;
    try {
      await waterfallService.createSavings(
        householdId,
        {
          name: "Bad type link",
          amount: 100,
          subcategoryId: savingsSubId,
          spendType: "monthly",
          linkedAccountId: currentAccountId,
        } as any,
        ctx
      );
    } catch (e: any) {
      threw = true;
      expect(e.message).toMatch(/Savings, StocksAndShares, or Pension/);
    }
    expect(threw).toBe(true);
  });

  it("updateSavings rejects a link to an account in a different household", async () => {
    const foreign = await createTestHousehold();
    const foreignAccount = await prisma.account.create({
      data: { householdId: foreign.id, name: "Foreign ISA", type: "Savings" },
    });
    const item = await prisma.discretionaryItem.create({
      data: { householdId, subcategoryId: savingsSubId, name: "Own allocation" },
    });
    try {
      let threw = false;
      try {
        await waterfallService.updateSavings(
          householdId,
          item.id,
          { linkedAccountId: foreignAccount.id } as any,
          ctx
        );
      } catch (e: any) {
        threw = true;
        expect(e.message).toMatch(/not found/i);
      }
      expect(threw).toBe(true);
      const reloaded = await prisma.discretionaryItem.findUnique({ where: { id: item.id } });
      expect(reloaded?.linkedAccountId).toBeNull();
    } finally {
      await prisma.household.delete({ where: { id: foreign.id } });
    }
  });

  it("updateSavings accepts a link to an account in the same household", async () => {
    const item = await prisma.discretionaryItem.create({
      data: { householdId, subcategoryId: savingsSubId, name: "Own allocation 2" },
    });
    const updated = await waterfallService.updateSavings(
      householdId,
      item.id,
      { linkedAccountId: savingsAccountId } as any,
      ctx
    );
    expect((updated as any).linkedAccountId).toBe(savingsAccountId);
  });

  it("updateSavings rejects linking on a planner-owned item", async () => {
    const plannerItem = await prisma.discretionaryItem.create({
      data: {
        householdId,
        subcategoryId: savingsSubId,
        name: "Planner savings",
        isPlannerOwned: true,
      },
    });
    let threw = false;
    try {
      await waterfallService.updateSavings(
        householdId,
        plannerItem.id,
        { linkedAccountId: savingsAccountId } as any,
        ctx
      );
    } catch (e: any) {
      threw = true;
      expect(e.message).toMatch(/planner/i);
    }
    expect(threw).toBe(true);
  });

  it("auto-nulls linkedAccountId when an item is moved out of Savings", async () => {
    const item = await waterfallService.createDiscretionary(
      householdId,
      {
        name: "x",
        amount: 100,
        subcategoryId: savingsSubId,
        spendType: "monthly",
        linkedAccountId: savingsAccountId,
      } as any,
      ctx
    );
    const updated = await waterfallService.updateDiscretionary(
      householdId,
      (item as any).id,
      { subcategoryId: otherSubId } as any,
      ctx
    );
    expect((updated as any).linkedAccountId).toBeNull();
  });
});
