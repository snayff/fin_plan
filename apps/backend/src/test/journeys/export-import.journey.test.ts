import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { buildApp } from "../../app";
import { truncateAllTables } from "../helpers/test-db";
import { prisma } from "../../config/database";
import type { FastifyInstance } from "fastify";

describe("Export/Import Journey", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAllTables();
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────

  async function getCsrfToken(): Promise<{ cookie: string; token: string }> {
    const res = await app.inject({ method: "GET", url: "/api/auth/csrf-token" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const raw = res.headers["set-cookie"];
    const cookies = Array.isArray(raw) ? raw : [raw];
    const csrfCookie = cookies.find((c) => c?.startsWith("_csrf="));
    expect(csrfCookie).toBeDefined();
    return { cookie: csrfCookie!.split(";")[0]!, token: body.csrfToken as string };
  }

  let emailCounter = 0;
  function uniqueEmail(prefix: string): string {
    emailCounter += 1;
    return `${prefix}-${Date.now()}-${emailCounter}@test.com`;
  }

  async function registerUser(
    email: string,
    name: string
  ): Promise<{ accessToken: string; userId: string }> {
    const csrf = await getCsrfToken();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrf.token,
        cookie: csrf.cookie,
      },
      payload: { email, password: "SecurePass123!", name },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    return { accessToken: body.accessToken as string, userId: body.user.id as string };
  }

  async function createHousehold(
    accessToken: string,
    name: string
  ): Promise<{ householdId: string }> {
    const csrf = await getCsrfToken();
    const res = await app.inject({
      method: "POST",
      url: "/api/households",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        "x-csrf-token": csrf.token,
        cookie: csrf.cookie,
      },
      payload: { name },
    });
    expect(res.statusCode).toBe(201);
    return { householdId: JSON.parse(res.body).household.id as string };
  }

  async function authedPost(accessToken: string, url: string, payload?: unknown) {
    const csrf = await getCsrfToken();
    return app.inject({
      method: "POST",
      url,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        "x-csrf-token": csrf.token,
        cookie: csrf.cookie,
      },
      payload: payload ?? {},
    });
  }

  function authedGet(accessToken: string, url: string) {
    return app.inject({ method: "GET", url, headers: { authorization: `Bearer ${accessToken}` } });
  }

  async function switchHousehold(accessToken: string, householdId: string) {
    return authedPost(accessToken, `/api/households/${householdId}/switch`);
  }

  async function firstSubcategoryId(accessToken: string, tier: string): Promise<string> {
    const res = await authedGet(accessToken, `/api/waterfall/subcategories/${tier}`);
    expect(res.statusCode).toBe(200);
    const subs = JSON.parse(res.body);
    expect(subs.length).toBeGreaterThan(0);
    return subs[0].id as string;
  }

  /** Seed a household with income, committed, an asset + balance, and an account + balance. */
  async function seedHousehold(accessToken: string) {
    const incomeRes = await authedPost(accessToken, "/api/waterfall/income", {
      name: "Salary",
      amount: 4000,
      frequency: "monthly",
      dueDate: "2026-01-25",
    });
    expect(incomeRes.statusCode).toBe(201);

    const committedSubId = await firstSubcategoryId(accessToken, "committed");
    const committedRes = await authedPost(accessToken, "/api/waterfall/committed", {
      name: "Rent",
      amount: 1200,
      spendType: "monthly",
      dueDate: "2026-01-01",
      subcategoryId: committedSubId,
    });
    expect(committedRes.statusCode).toBe(201);

    const assetRes = await authedPost(accessToken, "/api/assets/assets", {
      name: "Family Home",
      type: "Property",
      initialValue: 300000,
      initialValueDate: "2026-01-01",
    });
    expect(assetRes.statusCode).toBe(201);

    const acctRes = await authedPost(accessToken, "/api/assets/accounts", {
      name: "Emergency Fund",
      type: "Savings",
      initialValue: 20000,
      initialValueDate: "2026-01-01",
    });
    expect(acctRes.statusCode).toBe(201);
  }

  // ─── 1. Export → import round-trip into a fresh household ──────────────────

  it("exports a household and re-imports it into a new household with data intact", async () => {
    const owner = await registerUser(uniqueEmail("exp-owner"), "Export Owner");
    await createHousehold(owner.accessToken, "Original Household");
    await seedHousehold(owner.accessToken);

    // Export (owner-only).
    const exportRes = await authedGet(owner.accessToken, "/api/households/export");
    expect(exportRes.statusCode).toBe(200);
    const envelope = JSON.parse(exportRes.body);

    // Envelope carries the seeded data.
    expect(envelope.schemaVersion).toBeGreaterThanOrEqual(1);
    expect(envelope.household.name).toBe("Original Household");
    expect(envelope.incomeSources.find((i: { name: string }) => i.name === "Salary")).toBeDefined();
    expect(envelope.committedItems.find((c: { name: string }) => c.name === "Rent")).toBeDefined();
    expect(envelope.assets.find((a: { name: string }) => a.name === "Family Home")).toBeDefined();
    expect(
      envelope.accounts.find((a: { name: string }) => a.name === "Emergency Fund")
    ).toBeDefined();

    // A brand-new user imports the envelope into a fresh household (create_new).
    const importer = await registerUser(uniqueEmail("importer"), "Importer");
    await createHousehold(importer.accessToken, "Importer Placeholder Household");

    const importRes = await authedPost(
      importer.accessToken,
      "/api/households/import?mode=create_new",
      envelope
    );
    expect(importRes.statusCode).toBe(200);
    const importResult = JSON.parse(importRes.body);
    expect(importResult.success).toBe(true);
    expect(importResult.householdId).toBeString();

    // Switch the importer to the newly-created household and verify the data.
    const switchRes = await switchHousehold(importer.accessToken, importResult.householdId);
    expect(switchRes.statusCode).toBe(200);

    const income = JSON.parse(
      (await authedGet(importer.accessToken, "/api/waterfall/income")).body
    );
    expect(income.find((i: { name: string }) => i.name === "Salary")).toBeDefined();

    const committed = JSON.parse(
      (await authedGet(importer.accessToken, "/api/waterfall/committed")).body
    );
    expect(committed.find((c: { name: string }) => c.name === "Rent")).toBeDefined();

    const properties = JSON.parse(
      (await authedGet(importer.accessToken, "/api/assets/assets/Property")).body
    );
    const home = properties.find((a: { name: string }) => a.name === "Family Home");
    expect(home).toBeDefined();
    expect(home.currentBalance).toBe(300000);

    const savings = JSON.parse(
      (await authedGet(importer.accessToken, "/api/assets/accounts/Savings")).body
    );
    const fund = savings.find((a: { name: string }) => a.name === "Emergency Fund");
    expect(fund).toBeDefined();
    expect(fund.currentBalance).toBe(20000);
  });

  // ─── 2. Export is owner-only ──────────────────────────────────────────────

  it("a non-owner member of the household cannot export", async () => {
    // Owner creates + seeds a household.
    const owner = await registerUser(uniqueEmail("owner2"), "Owner Two");
    const { householdId } = await createHousehold(owner.accessToken, "Shared Household");

    // Invite a member and have them join → role "member".
    const inviteeEmail = uniqueEmail("member-invitee");
    const inviteRes = await authedPost(owner.accessToken, `/api/households/${householdId}/invite`, {
      email: inviteeEmail,
      name: "Invited Member",
    });
    expect(inviteRes.statusCode).toBe(201);
    const inviteToken = JSON.parse(inviteRes.body).token as string;

    const member = await registerUser(inviteeEmail, "Invited Member");
    await createHousehold(member.accessToken, "Member Placeholder Household");

    const joinRes = await authedPost(member.accessToken, `/api/auth/invite/${inviteToken}/join`);
    expect(joinRes.statusCode).toBe(200);

    // Switch the member into the shared household so it is their active one.
    const switchRes = await switchHousehold(member.accessToken, householdId);
    expect(switchRes.statusCode).toBe(200);

    // Export must be rejected for the non-owner member (403).
    const exportRes = await authedGet(member.accessToken, "/api/households/export");
    expect(exportRes.statusCode).toBe(403);

    // The owner can still export fine.
    const ownerExport = await authedGet(owner.accessToken, "/api/households/export");
    expect(ownerExport.statusCode).toBe(200);
  });

  // ─── 3. Import is transactional/atomic ────────────────────────────────────

  it("a failing import creates no partial household (transaction rolls back)", async () => {
    const importer = await registerUser(uniqueEmail("atomic"), "Atomic Importer");
    await createHousehold(importer.accessToken, "Atomic Placeholder Household");

    // Build a valid-schema envelope whose income source references a subcategory
    // that is not declared — this passes Zod validation but throws mid-transaction
    // (Unknown subcategory) AFTER the new household + owner member are created.
    // Atomicity requires the whole transaction to roll back, leaving no household.
    const exportRes = await authedGet(importer.accessToken, "/api/households/export");
    expect(exportRes.statusCode).toBe(200);
    const envelope = JSON.parse(exportRes.body);

    // Poison: an income source pointing at a non-existent subcategory. Keep the
    // subcategories array empty so lookupSub throws.
    envelope.household.name = "Poisoned Import Household";
    envelope.subcategories = [];
    envelope.incomeSources = [
      {
        subcategoryName: "Does Not Exist",
        name: "Ghost Income",
        frequency: "monthly",
        incomeType: "salary",
        dueDate: new Date("2026-01-01").toISOString(),
        ownerName: null,
        sortOrder: 0,
        lastReviewedAt: new Date("2026-01-01").toISOString(),
        notes: null,
        periods: [],
      },
    ];
    envelope.committedItems = [];
    envelope.discretionaryItems = [];
    envelope.itemAmountPeriods = [];
    envelope.waterfallHistory = [];
    envelope.assets = [];
    envelope.accounts = [];

    const beforeCount = await prisma.household.count({
      where: { name: "Poisoned Import Household" },
    });
    expect(beforeCount).toBe(0);

    const importRes = await authedPost(
      importer.accessToken,
      "/api/households/import?mode=create_new",
      envelope
    );
    // The import must fail (validation error surfaced from lookupSub).
    expect(importRes.statusCode).toBeGreaterThanOrEqual(400);

    // Atomicity: no household with the poisoned name persisted.
    const afterCount = await prisma.household.count({
      where: { name: "Poisoned Import Household" },
    });
    expect(afterCount).toBe(0);
  });

  // ─── 4. Import validation rejects a future schema version ─────────────────

  it("rejects an import payload with an unsupported (future) schema version", async () => {
    const importer = await registerUser(uniqueEmail("badschema"), "Bad Schema Importer");
    await createHousehold(importer.accessToken, "Bad Schema Household");

    const exportRes = await authedGet(importer.accessToken, "/api/households/export");
    expect(exportRes.statusCode).toBe(200);
    const envelope = JSON.parse(exportRes.body);
    envelope.schemaVersion = 999;

    const importRes = await authedPost(
      importer.accessToken,
      "/api/households/import?mode=create_new",
      envelope
    );
    expect(importRes.statusCode).toBeGreaterThanOrEqual(400);
  });
});
