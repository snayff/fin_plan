import { describe, it, expect, mock } from "bun:test";
import { z } from "zod";
import { ValidationError, NotFoundError } from "../utils/errors";
import { errorHandler } from "./errorHandler";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildReply() {
  const reply = {
    _status: 0,
    _body: undefined as any,
    status(code: number) {
      this._status = code;
      return this;
    },
    send(body: any) {
      this._body = body;
      return this;
    },
  };
  return reply;
}

function buildRequest() {
  return { log: { error: mock(() => {}) } } as any;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("errorHandler", () => {
  describe("AppError", () => {
    it("returns the AppError statusCode and code", async () => {
      const reply = buildReply();
      await errorHandler(new NotFoundError("Item not found") as any, buildRequest(), reply as any);
      expect(reply._status).toBe(404);
      expect(reply._body.error.code).toBe("NOT_FOUND");
      expect(reply._body.error.message).toBe("Item not found");
    });

    it("returns 400 for ValidationError", async () => {
      const reply = buildReply();
      await errorHandler(new ValidationError("Invalid input") as any, buildRequest(), reply as any);
      expect(reply._status).toBe(400);
      expect(reply._body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("ZodError", () => {
    it("returns 400 with VALIDATION_ERROR code for a single Zod failure", async () => {
      const reply = buildReply();
      const zodErr = z.object({ name: z.string() }).safeParse({ name: 42 }).error!;
      await errorHandler(zodErr as any, buildRequest(), reply as any);
      expect(reply._status).toBe(400);
      expect(reply._body.error.code).toBe("VALIDATION_ERROR");
      expect(typeof reply._body.error.message).toBe("string");
    });

    it("prefixes multiple Zod errors with numbered list", async () => {
      const reply = buildReply();
      const zodErr = z.object({ a: z.string(), b: z.number() }).safeParse({}).error!;
      await errorHandler(zodErr as any, buildRequest(), reply as any);
      expect(reply._body.error.message).toContain("1.");
      expect(reply._body.error.message).toContain("2.");
    });

    it("only exposes field and message in details — no raw Zod issue internals", async () => {
      const reply = buildReply();
      const zodErr = z.object({ name: z.string() }).safeParse({ name: 42 }).error!;
      await errorHandler(zodErr as any, buildRequest(), reply as any);
      expect(Array.isArray(reply._body.error.details)).toBe(true);
      for (const detail of reply._body.error.details) {
        expect(Object.keys(detail).sort()).toEqual(["field", "message"]);
      }
    });
  });

  describe("Fastify validation error", () => {
    it("returns 400 with VALIDATION_ERROR for errors with .validation property", async () => {
      const reply = buildReply();
      const fastifyErr = Object.assign(new Error("body is required"), {
        validation: [{ message: "body is required" }],
      });
      await errorHandler(fastifyErr as any, buildRequest(), reply as any);
      expect(reply._status).toBe(400);
      expect(reply._body.error.code).toBe("VALIDATION_ERROR");
    });

    it("does not echo raw validation objects to the client", async () => {
      const reply = buildReply();
      const fastifyErr = Object.assign(new Error("body is required"), {
        validation: [{ instancePath: "/secret", schemaPath: "#/required", message: "required" }],
      });
      await errorHandler(fastifyErr as any, buildRequest(), reply as any);
      expect(reply._body.error.details).toBeUndefined();
    });
  });

  describe("Prisma known request errors", () => {
    it("returns 400 with DATABASE_ERROR for P2002 unique constraint", async () => {
      const reply = buildReply();
      const err = Object.assign(new Error("Unique constraint"), {
        name: "PrismaClientKnownRequestError",
        code: "P2002",
        meta: { target: ["email"] },
      });
      await errorHandler(err as any, buildRequest(), reply as any);
      expect(reply._status).toBe(400);
      expect(reply._body.error.code).toBe("DATABASE_ERROR");
      // Constraint column names must never reach the client
      expect(reply._body.error.message).not.toContain("email");
      expect(reply._body.error.message).toBe("A record with these details already exists");
      expect(reply._body.error.details).toBeUndefined();
    });

    it("returns 400 for P2025 record not found", async () => {
      const reply = buildReply();
      const err = Object.assign(new Error("Record not found"), {
        name: "PrismaClientKnownRequestError",
        code: "P2025",
        meta: {},
      });
      await errorHandler(err as any, buildRequest(), reply as any);
      expect(reply._status).toBe(400);
      expect(reply._body.error.message).toBe("The requested record was not found");
    });
  });

  describe("Prisma initialization error", () => {
    it("returns 500 with DATABASE_CONNECTION_ERROR", async () => {
      const reply = buildReply();
      const err = Object.assign(new Error("DB init failed"), {
        name: "PrismaClientInitializationError",
      });
      await errorHandler(err as any, buildRequest(), reply as any);
      expect(reply._status).toBe(500);
      expect(reply._body.error.code).toBe("DATABASE_CONNECTION_ERROR");
    });
  });

  describe("Generic error fallback", () => {
    it("returns 500 with INTERNAL_ERROR for unknown errors", async () => {
      const reply = buildReply();
      await errorHandler(new Error("Something went wrong") as any, buildRequest(), reply as any);
      expect(reply._status).toBe(500);
      expect(reply._body.error.code).toBe("INTERNAL_ERROR");
    });
  });
});
