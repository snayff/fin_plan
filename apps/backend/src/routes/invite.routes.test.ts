import { describe, it, expect, mock, beforeEach, beforeAll, afterAll } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "../test/helpers/fastify";
import { errorHandler } from "../middleware/errorHandler";
import { AuthenticationError, NotFoundError, ValidationError } from "../utils/errors";

mock.module("../services/household.service", () => ({
  householdService: {
    validateInviteToken: mock(() => {}),
    acceptInvite: mock(() => {}),
    joinViaInvite: mock(() => {}),
  },
}));

mock.module("../middleware/auth.middleware", () => ({
  authMiddleware: mock(() => {}),
}));

// acceptInviteSchema is used directly in the route — no mock needed

import { householdService } from "../services/household.service";
import { authMiddleware } from "../middleware/auth.middleware";
import { inviteRoutes } from "./invite";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  app.setErrorHandler(errorHandler);
  await app.register(inviteRoutes, { prefix: "/api/auth" });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const authHeaders = { authorization: "Bearer valid-token" };

const mockInvite = {
  householdId: "household-1",
  email: null,
  household: { id: "household-1", name: "Smith Family" },
};

const mockUser = {
  id: "user-1",
  name: "Alice",
  email: "alice@example.com",
  activeHouseholdId: "household-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  for (const method of Object.values(householdService) as any[]) {
    if (typeof method?.mockReset === "function") method.mockReset();
  }

  (householdService.validateInviteToken as any).mockResolvedValue(mockInvite);
  (householdService.acceptInvite as any).mockResolvedValue({
    user: mockUser,
    accessToken: "access-token",
    refreshToken: "refresh-token",
  });
  (householdService.joinViaInvite as any).mockResolvedValue({
    id: "household-1",
    name: "Smith Family",
  });

  (authMiddleware as any).mockImplementation(async (request: any) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new AuthenticationError("No token");
    request.user = { userId: "user-1", email: "alice@example.com" };
    request.householdId = "household-1";
  });
});

// ─── GET /api/auth/invite/:token ──────────────────────────────────────────────

describe("GET /api/auth/invite/:token", () => {
  it("returns household info for a valid token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/invite/valid-token" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.householdId).toBe("household-1");
    expect(body.householdName).toBe("Smith Family");
    expect(body.emailRequired).toBe(false);
    expect(body.maskedInvitedEmail).toBeNull();
  });

  it("returns masked invite email when token is email-bound", async () => {
    (householdService.validateInviteToken as any).mockResolvedValue({
      ...mockInvite,
      email: "alice@example.com",
    });

    const res = await app.inject({ method: "GET", url: "/api/auth/invite/valid-token" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.emailRequired).toBe(true);
    expect(body.maskedInvitedEmail).toBe("a****@example.com");
  });

  it("returns 404 when the token does not exist", async () => {
    (householdService.validateInviteToken as any).mockRejectedValue(
      new NotFoundError("Invite not found")
    );
    const res = await app.inject({ method: "GET", url: "/api/auth/invite/bad-token" });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 for a malformed token with disallowed characters (#SEC-6)", async () => {
    // '$' is outside the allowed [a-zA-Z0-9._-] set and the segment is short
    // enough to pass Fastify's router (default maxParamLength), so it reaches
    // and is rejected by the Zod param schema.
    const res = await app.inject({ method: "GET", url: "/api/auth/invite/bad%24token" });
    expect(res.statusCode).toBe(400);
    expect(householdService.validateInviteToken).not.toHaveBeenCalled();
  });
});

// ─── POST /api/auth/invite/:token/accept ─────────────────────────────────────

describe("POST /api/auth/invite/:token/accept", () => {
  const validBody = {
    name: "Alice Smith",
    email: "alice@example.com",
    password: "Str0ng!Pass123",
  };

  it("creates user and returns 201 with user and accessToken", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/invite/valid-token/accept",
      payload: validBody,
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.accessToken).toBe("access-token");
    expect(body.user.id).toBe("user-1");
  });

  it("returns 400 when body fails Zod schema validation", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/invite/valid-token/accept",
      payload: { name: "A", email: "not-an-email", password: "short" },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── POST /api/auth/invite/:token/join ───────────────────────────────────────

describe("POST /api/auth/invite/:token/join", () => {
  it("joins household for authenticated user and returns household", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/invite/valid-token/join",
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.household.id).toBe("household-1");
  });

  it("returns 401 when not authenticated", async () => {
    (authMiddleware as any).mockImplementation(async () => {
      throw new AuthenticationError("No token");
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/invite/valid-token/join",
    });
    expect(res.statusCode).toBe(401);
  });
});
