import { describe, it, expect, mock, beforeEach } from "bun:test";
import { join } from "path";
import { prismaMock, resetPrismaMocks } from "./test/mocks/prisma";

// Mock retention before importing app
const startRetentionJobMock = mock(() => {});
mock.module("./services/retention.service", () => ({
  startRetentionJob: startRetentionJobMock,
  RETENTION_DAYS: 180,
  purgeOldAuditLogs: mock(async () => 0),
}));

// Mock the prisma singleton so /health DB ping is controllable
mock.module("./config/database", () => ({ prisma: prismaMock }));

const { buildApp } = await import("./app");

describe("buildApp retention wiring", () => {
  it("calls startRetentionJob on app build", async () => {
    await buildApp({ logger: false });
    expect(startRetentionJobMock).toHaveBeenCalledTimes(1);
  });
});

describe("legacy setup-session removal", () => {
  it("does not have a setup-session service file", async () => {
    const fs = await import("fs");
    const servicePath = join(import.meta.dir, "services", "setup-session.service.ts");
    expect(fs.existsSync(servicePath)).toBe(false);
  });

  it("returns 404 for /api/setup-session", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/setup-session" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("/health route", () => {
  beforeEach(() => resetPrismaMocks());

  it("returns 200 with status ok when the DB ping succeeds", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ "?column?": 1 }] as any);
    const app = await buildApp({ logger: false });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("returns 503 with a generic body when the DB ping throws", async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error("connection refused: secret-host:5432"));
    const app = await buildApp({ logger: false });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.status).toBe("unavailable");
    // Must not leak the underlying error detail
    expect(JSON.stringify(body)).not.toContain("secret-host");
    await app.close();
  });
});
