import { describe, it, expect, mock, beforeEach } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";

mock.module("../config/database", () => ({
  prisma: prismaMock,
}));

import { blacklistToken, isTokenBlacklisted, purgeExpiredRevocations } from "./tokenBlacklist";

beforeEach(() => {
  resetPrismaMocks();
});

describe("tokenBlacklist (database-backed)", () => {
  describe("blacklistToken", () => {
    it("persists the jti with the supplied expiry", async () => {
      prismaMock.revokedAccessToken.upsert.mockResolvedValue({} as never);
      const expiresAt = new Date(Date.now() + 60_000);

      await blacklistToken("jti-1", expiresAt);

      expect(prismaMock.revokedAccessToken.upsert).toHaveBeenCalledWith({
        where: { jti: "jti-1" },
        create: { jti: "jti-1", expiresAt },
        update: { expiresAt },
      });
    });

    it("defaults the expiry to ~15 minutes when none supplied", async () => {
      prismaMock.revokedAccessToken.upsert.mockResolvedValue({} as never);
      const before = Date.now();

      await blacklistToken("jti-2");

      const call = (prismaMock.revokedAccessToken.upsert.mock.calls[0] as any)[0] as {
        create: { expiresAt: Date };
      };
      const expiry = call.create.expiresAt.getTime();
      expect(expiry).toBeGreaterThanOrEqual(before + 14 * 60 * 1000);
      expect(expiry).toBeLessThanOrEqual(before + 16 * 60 * 1000);
    });
  });

  describe("isTokenBlacklisted", () => {
    it("returns false for an unknown jti", async () => {
      prismaMock.revokedAccessToken.findUnique.mockResolvedValue(null);
      expect(await isTokenBlacklisted("unknown-jti")).toBe(false);
    });

    it("returns true for a persisted, unexpired entry", async () => {
      prismaMock.revokedAccessToken.findUnique.mockResolvedValue({
        expiresAt: new Date(Date.now() + 60_000),
      } as never);
      expect(await isTokenBlacklisted("jti-active")).toBe(true);
    });

    it("returns false once the entry's token has expired anyway", async () => {
      prismaMock.revokedAccessToken.findUnique.mockResolvedValue({
        expiresAt: new Date(Date.now() - 1_000),
      } as never);
      expect(await isTokenBlacklisted("jti-expired")).toBe(false);
    });

    it("performs an indexed lookup by jti", async () => {
      prismaMock.revokedAccessToken.findUnique.mockResolvedValue(null);
      await isTokenBlacklisted("jti-3");
      expect(prismaMock.revokedAccessToken.findUnique).toHaveBeenCalledWith({
        where: { jti: "jti-3" },
        select: { expiresAt: true },
      });
    });
  });

  describe("purgeExpiredRevocations", () => {
    it("deletes only entries whose expiry has passed", async () => {
      prismaMock.revokedAccessToken.deleteMany.mockResolvedValue({ count: 3 } as never);

      const removed = await purgeExpiredRevocations();

      expect(removed).toBe(3);
      const arg = (prismaMock.revokedAccessToken.deleteMany.mock.calls[0] as any)[0] as {
        where: { expiresAt: { lt: Date } };
      };
      expect(arg.where.expiresAt.lt).toBeInstanceOf(Date);
    });
  });
});
