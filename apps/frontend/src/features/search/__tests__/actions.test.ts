import { describe, it, expect } from "vitest";
import { NAV_ACTIONS, CREATE_ACTIONS, ALL_ACTIONS } from "../actions";

describe("action registry", () => {
  // No hard-coded counts: destinations.test.tsx opens every create action's
  // page and fails if one isn't wired, which is what the counts stood in for.

  it("every nav action has a route and no addParam", () => {
    for (const a of NAV_ACTIONS) {
      expect(a.kind).toBe("nav");
      expect(a.route).toMatch(/^\//);
      expect(a.addParam).toBeUndefined();
    }
  });

  it("every create action has a route and an addParam", () => {
    for (const a of CREATE_ACTIONS) {
      expect(a.kind).toBe("create");
      expect(a.route).toMatch(/^\//);
      expect(a.addParam).toBeTruthy();
    }
  });

  it("ids are unique", () => {
    const ids = ALL_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
