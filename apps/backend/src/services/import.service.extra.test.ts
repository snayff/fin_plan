import { describe, it, expect, mock, beforeEach } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database", () => ({ prisma: prismaMock }));

import { importService } from "./import.service";
import { AuthorizationError, NotFoundError, ValidationError } from "../utils/errors";

beforeEach(() => resetPrismaMocks());

describe("importService.validateImportData — duplicate members", () => {
  it("rejects an export that repeats a member name", () => {
    const result = importService.validateImportData({
      schemaVersion: 2,
      members: [{ name: "Alex" }, { name: "Alex" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors?.join(" ")).toMatch(/Duplicate member names/i);
  });
});

describe("importService.restoreFromBackup — guards", () => {
  const owner = { id: "m-1", householdId: "hh-1", userId: "u-1", role: "owner" } as any;

  it("rejects callers who are not the household owner", async () => {
    prismaMock.member.findFirst.mockResolvedValue(null);
    await expect(importService.restoreFromBackup("hh-1", "u-1", "b-1")).rejects.toThrow(
      AuthorizationError
    );
  });

  it("throws NotFoundError when the backup does not exist", async () => {
    prismaMock.member.findFirst.mockResolvedValue(owner);
    prismaMock.importBackup.findUnique.mockResolvedValue(null);
    await expect(importService.restoreFromBackup("hh-1", "u-1", "b-1")).rejects.toThrow(
      NotFoundError
    );
  });

  it("throws NotFoundError when the backup belongs to another household", async () => {
    prismaMock.member.findFirst.mockResolvedValue(owner);
    prismaMock.importBackup.findUnique.mockResolvedValue({
      id: "b-1",
      householdId: "other",
      expiresAt: new Date(Date.now() + 1000),
      data: {},
    } as any);
    await expect(importService.restoreFromBackup("hh-1", "u-1", "b-1")).rejects.toThrow(
      NotFoundError
    );
  });

  it("throws ValidationError when the backup has expired", async () => {
    prismaMock.member.findFirst.mockResolvedValue(owner);
    prismaMock.importBackup.findUnique.mockResolvedValue({
      id: "b-1",
      householdId: "hh-1",
      expiresAt: new Date(Date.now() - 1000),
      data: {},
    } as any);
    await expect(importService.restoreFromBackup("hh-1", "u-1", "b-1")).rejects.toThrow(
      ValidationError
    );
  });

  it("forwards the actor ctx to importHousehold so the restore-overwrite is audited (#123)", async () => {
    const owner = { id: "m-1", householdId: "hh-1", userId: "u-1", role: "owner" } as any;
    prismaMock.member.findFirst.mockResolvedValue(owner);
    prismaMock.importBackup.findUnique.mockResolvedValue({
      id: "b-1",
      householdId: "hh-1",
      expiresAt: new Date(Date.now() + 60_000),
      data: { backup: "payload" },
    } as any);
    prismaMock.importBackup.delete.mockResolvedValue({} as any);

    const ctx = {
      householdId: "hh-1",
      actorId: "u-1",
      actorName: "Owner",
      ipAddress: "127.0.0.1",
      userAgent: "test",
    };
    const importSpy = mock(() =>
      Promise.resolve({ success: true, householdId: "hh-1", backupId: "new-backup" })
    );
    const original = importService.importHousehold;
    importService.importHousehold = importSpy as any;
    try {
      const result = await importService.restoreFromBackup("hh-1", "u-1", "b-1", ctx);
      expect(result).toEqual({ success: true, householdId: "hh-1" });
      // ctx threaded through as the 5th argument (overwrite mode audits it).
      expect(importSpy).toHaveBeenCalledWith(
        "hh-1",
        "u-1",
        { backup: "payload" },
        "overwrite",
        ctx
      );
    } finally {
      importService.importHousehold = original;
    }
  });
});
