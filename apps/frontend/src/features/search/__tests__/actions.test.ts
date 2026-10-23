import { describe, it, expect } from "vitest";
import { NAV_ACTIONS, CREATE_ACTIONS, ALL_ACTIONS, isDesktopOnlyRoute } from "../actions";

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

describe("desktop-only flags", () => {
  // A create action that lands on a page which soft-blocks on mobile must be
  // badged like that page's nav action, or mobile users tap into a dead end.
  it("every action routing to a desktop-only page is flagged desktopOnly", () => {
    for (const a of ALL_ACTIONS) {
      expect({ id: a.id, desktopOnly: a.desktopOnly === true }).toEqual({
        id: a.id,
        desktopOnly: isDesktopOnlyRoute(a.route),
      });
    }
  });

  it("treats Gifts as desktop-only and Assets as mobile-ready", () => {
    expect(isDesktopOnlyRoute("/gifts")).toBe(true);
    expect(isDesktopOnlyRoute("/assets")).toBe(false);
  });
});
