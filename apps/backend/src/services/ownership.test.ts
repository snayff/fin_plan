import { describe, it, expect, beforeEach } from "bun:test";
import { mock } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../test/mocks/prisma";
import { NotFoundError, ValidationError } from "../utils/errors.js";

mock.module("../config/database.js", () => ({ prisma: prismaMock }));

const { assertOwned, assertMemberInHousehold } = await import("./ownership.js");

beforeEach(() => {
  resetPrismaMocks();
});

describe("assertOwned", () => {
  it("passes for an entity owned by the household", () => {
    expect(() => assertOwned({ householdId: "hh-1" }, "hh-1", "Gift person")).not.toThrow();
  });

  it("throws NotFoundError when the entity is null", () => {
    expect(() => assertOwned(null, "hh-1", "Gift person")).toThrow(NotFoundError);
    expect(() => assertOwned(null, "hh-1", "Gift person")).toThrow("Gift person not found");
  });

  it("throws a masked NotFoundError when the entity belongs to another household", () => {
    // Masking: the wrong-household case must be indistinguishable from not-found.
    expect(() => assertOwned({ householdId: "hh-2" }, "hh-1", "Purchase")).toThrow(NotFoundError);
    expect(() => assertOwned({ householdId: "hh-2" }, "hh-1", "Purchase")).toThrow(
      "Purchase not found"
    );
  });
});

describe("assertMemberInHousehold — waterfall variant (findFirst / NotFoundError)", () => {
  const opts = {
    query: "findFirst" as const,
    error: "NotFoundError" as const,
    message: "Household member not found",
  };

  it("passes when the member is found in the household", async () => {
    prismaMock.member.findFirst.mockResolvedValue({ id: "m-1", householdId: "hh-1" } as any);

    await expect(assertMemberInHousehold("hh-1", "m-1", opts)).resolves.toBeUndefined();

    expect(prismaMock.member.findFirst).toHaveBeenCalledWith({
      where: { householdId: "hh-1", id: "m-1" },
    });
    expect(prismaMock.member.findUnique).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the member is not in the household", async () => {
    prismaMock.member.findFirst.mockResolvedValue(null as any);

    await expect(assertMemberInHousehold("hh-1", "m-x", opts)).rejects.toThrow(NotFoundError);
    await expect(assertMemberInHousehold("hh-1", "m-x", opts)).rejects.toThrow(
      "Household member not found"
    );
  });
});

describe("assertMemberInHousehold — assets variant (findUnique / ValidationError)", () => {
  const opts = {
    query: "findUnique" as const,
    error: "ValidationError" as const,
    message: "Member not found in household",
  };

  it("passes when the member belongs to the household", async () => {
    prismaMock.member.findUnique.mockResolvedValue({ id: "m-1", householdId: "hh-1" } as any);

    await expect(assertMemberInHousehold("hh-1", "m-1", opts)).resolves.toBeUndefined();

    expect(prismaMock.member.findUnique).toHaveBeenCalledWith({
      where: { id: "m-1" },
      select: { id: true, householdId: true },
    });
    expect(prismaMock.member.findFirst).not.toHaveBeenCalled();
  });

  it("throws ValidationError when the member is missing", async () => {
    prismaMock.member.findUnique.mockResolvedValue(null as any);

    await expect(assertMemberInHousehold("hh-1", "m-x", opts)).rejects.toThrow(ValidationError);
    await expect(assertMemberInHousehold("hh-1", "m-x", opts)).rejects.toThrow(
      "Member not found in household"
    );
  });

  it("throws ValidationError (masked) when the member belongs to another household", async () => {
    prismaMock.member.findUnique.mockResolvedValue({ id: "m-1", householdId: "hh-2" } as any);

    await expect(assertMemberInHousehold("hh-1", "m-1", opts)).rejects.toThrow(ValidationError);
    await expect(assertMemberInHousehold("hh-1", "m-1", opts)).rejects.toThrow(
      "Member not found in household"
    );
  });
});
