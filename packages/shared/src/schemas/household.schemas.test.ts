import { describe, it, expect } from "bun:test";
import {
  createHouseholdSchema,
  renameHouseholdSchema,
  createHouseholdInviteSchema,
  acceptInviteSchema,
  createMemberSchema,
  updateMemberSchema,
} from "./household.schemas";

describe("createHouseholdSchema", () => {
  it("accepts valid name", () => {
    const result = createHouseholdSchema.safeParse({ name: "Smith Family" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createHouseholdSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = createHouseholdSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("renameHouseholdSchema", () => {
  it("accepts valid name", () => {
    const result = renameHouseholdSchema.safeParse({ name: "Jones Family" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = renameHouseholdSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = renameHouseholdSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("createHouseholdInviteSchema", () => {
  it("rejects missing email", () => {
    const result = createHouseholdInviteSchema.safeParse({ name: "Alice" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid email and name", () => {
    const result = createHouseholdInviteSchema.safeParse({
      email: "alice@example.com",
      name: "Alice",
    });
    expect(result.success).toBe(true);
  });

  it("trims email and name values", () => {
    const result = createHouseholdInviteSchema.safeParse({
      email: "  alice@example.com  ",
      name: "  Alice  ",
    });
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe("alice@example.com");
    expect(result.data?.name).toBe("Alice");
  });

  it("rejects blank email", () => {
    const result = createHouseholdInviteSchema.safeParse({ email: "   ", name: "Alice" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = createHouseholdInviteSchema.safeParse({ email: "bad-email", name: "Alice" });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = createHouseholdInviteSchema.safeParse({ email: "alice@example.com" });
    expect(result.success).toBe(false);
  });

  it("rejects blank name", () => {
    const result = createHouseholdInviteSchema.safeParse({
      email: "alice@example.com",
      name: "   ",
    });
    expect(result.success).toBe(false);
  });
});

describe("acceptInviteSchema", () => {
  const validInput = {
    name: "Alice",
    email: "alice@example.com",
    password: "supersecret123",
  };

  it("accepts valid input", () => {
    const result = acceptInviteSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts password of exactly 12 characters", () => {
    const result = acceptInviteSchema.safeParse({ ...validInput, password: "a".repeat(12) });
    expect(result.success).toBe(true);
  });

  it("rejects password shorter than 12 characters", () => {
    const result = acceptInviteSchema.safeParse({ ...validInput, password: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects password of exactly 11 characters", () => {
    const result = acceptInviteSchema.safeParse({ ...validInput, password: "a".repeat(11) });
    expect(result.success).toBe(false);
  });

  it("accepts password of exactly 128 characters", () => {
    const result = acceptInviteSchema.safeParse({ ...validInput, password: "a".repeat(128) });
    expect(result.success).toBe(true);
  });

  it("rejects password longer than 128 characters", () => {
    const result = acceptInviteSchema.safeParse({ ...validInput, password: "a".repeat(129) });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = acceptInviteSchema.safeParse({ ...validInput, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const { name, ...rest } = validInput;
    const result = acceptInviteSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format", () => {
    const result = acceptInviteSchema.safeParse({ ...validInput, email: "bad-email" });
    expect(result.success).toBe(false);
  });

  it("rejects missing email", () => {
    const { email, ...rest } = validInput;
    const result = acceptInviteSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing password", () => {
    const { password, ...rest } = validInput;
    const result = acceptInviteSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe("createMemberSchema", () => {
  it("accepts valid member with name only", () => {
    const result = createMemberSchema.safeParse({ name: "Alice" });
    expect(result.success).toBe(true);
  });

  it("accepts member with all optional fields", () => {
    const result = createMemberSchema.safeParse({
      name: "Alice",
      dateOfBirth: "1990-05-15T00:00:00.000Z",
      retirementYear: 2055,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createMemberSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});

describe("updateMemberSchema", () => {
  it("accepts partial update", () => {
    const result = updateMemberSchema.safeParse({ name: "Bob" });
    expect(result.success).toBe(true);
  });

  it("accepts null dateOfBirth to clear it", () => {
    const result = updateMemberSchema.safeParse({ dateOfBirth: null });
    expect(result.success).toBe(true);
  });
});
