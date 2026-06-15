import { describe, it, expect, mock, beforeEach, beforeAll, afterAll } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "../test/helpers/fastify";
import { errorHandler } from "../middleware/errorHandler";
import { AuthenticationError, AuthorizationError } from "../utils/errors";

const snapshotServiceMock = {
  listSnapshots: mock(() => Promise.resolve([])),
  getSnapshot: mock(() => Promise.resolve(null)),
  createSnapshot: mock(() => Promise.resolve(null)),
  renameSnapshot: mock(() => Promise.resolve(null)),
  deleteSnapshot: mock(() => Promise.resolve()),
};

mock.module("../services/snapshot.service", () => ({
  snapshotService: snapshotServiceMock,
}));

mock.module("../middleware/auth.middleware", () => ({
  authMiddleware: mock(() => {}),
}));

import { authMiddleware } from "../middleware/auth.middleware";
import { snapshotRoutes } from "./snapshots.routes";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  app.setErrorHandler(errorHandler);
  await app.register(snapshotRoutes, { prefix: "/api/snapshots" });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const mockSnapshot = {
  id: "snap-1",
  householdId: "hh-1",
  name: "March 2026",
  data: {},
  isAuto: false,
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  for (const method of Object.values(snapshotServiceMock)) {
    if (typeof method?.mockReset === "function") method.mockReset();
  }
  snapshotServiceMock.listSnapshots.mockResolvedValue([mockSnapshot] as any);
  snapshotServiceMock.getSnapshot.mockResolvedValue(mockSnapshot as any);
  snapshotServiceMock.createSnapshot.mockResolvedValue(mockSnapshot as any);
  snapshotServiceMock.renameSnapshot.mockResolvedValue(mockSnapshot as any);
  snapshotServiceMock.deleteSnapshot.mockResolvedValue(undefined);

  (authMiddleware as any).mockImplementation(async (request: any) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthenticationError("No authorization token provided");
    }
    request.user = { userId: "user-1", email: "test@test.com" };
    request.householdId = "hh-1";
  });
});

describe("GET /api/snapshots", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/snapshots" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with snapshot list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/snapshots",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });
});

describe("GET /api/snapshots/:id", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/snapshots/snap-1" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with snapshot data", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/snapshots/snap-1",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("March 2026");
  });

  it("returns 400 for an over-length id param and never hits the service", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/snapshots/${"x".repeat(65)}`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(400);
    expect(snapshotServiceMock.getSnapshot).not.toHaveBeenCalled();
  });
});

describe("POST /api/snapshots", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/snapshots",
      payload: { name: "Test" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 201 with created snapshot", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/snapshots",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Test Snapshot" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("returns 400 for missing name", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/snapshots",
      headers: { authorization: "Bearer valid-token" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PATCH /api/snapshots/:id", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/snapshots/snap-1",
      payload: { name: "Renamed" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with renamed snapshot", async () => {
    const renamed = { ...mockSnapshot, name: "Renamed" };
    snapshotServiceMock.renameSnapshot.mockResolvedValue(renamed as any);
    const res = await app.inject({
      method: "PATCH",
      url: "/api/snapshots/snap-1",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Renamed" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Renamed");
  });
});

describe("DELETE /api/snapshots/:id", () => {
  it("returns 401 without auth token", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/snapshots/snap-1" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 204 when deleting", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/snapshots/snap-1",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(204);
  });
});

describe("PATCH /api/snapshots/:id — auto-snapshot protection", () => {
  it("returns 403 when patching an auto-snapshot", async () => {
    snapshotServiceMock.renameSnapshot.mockRejectedValue(
      new AuthorizationError("Auto-snapshots cannot be renamed")
    );
    const res = await app.inject({
      method: "PATCH",
      url: "/api/snapshots/snap-auto",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Renamed" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("DELETE /api/snapshots/:id — auto-snapshot protection", () => {
  it("returns 403 when deleting an auto-snapshot", async () => {
    snapshotServiceMock.deleteSnapshot.mockRejectedValue(
      new AuthorizationError("Auto-snapshots cannot be deleted")
    );
    const res = await app.inject({
      method: "DELETE",
      url: "/api/snapshots/snap-auto",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(403);
  });
});
