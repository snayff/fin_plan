import { describe, it, expect } from "bun:test";
import { idParamSchema, ID_MAX } from "../common.schemas";

describe("idParamSchema", () => {
  it("accepts a normal id param", () => {
    const r = idParamSchema.safeParse({ id: "clh7x9a2b0000abcd1234efgh" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.id).toBe("clh7x9a2b0000abcd1234efgh");
  });

  it("rejects an empty id", () => {
    expect(idParamSchema.safeParse({ id: "" }).success).toBe(false);
  });

  it("rejects a missing id", () => {
    expect(idParamSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an id over the length cap", () => {
    expect(idParamSchema.safeParse({ id: "x".repeat(ID_MAX + 1) }).success).toBe(false);
    expect(idParamSchema.safeParse({ id: "x".repeat(ID_MAX) }).success).toBe(true);
  });

  it("strips unknown params (object default strips extras)", () => {
    const r = idParamSchema.safeParse({ id: "abc", extra: "ignored" });
    expect(r.success).toBe(true);
    if (r.success) expect("extra" in r.data).toBe(false);
  });
});
