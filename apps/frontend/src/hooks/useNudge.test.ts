import { describe, it, expect } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useSavingsNudge, useWealthAccountNudge } from "./useNudge";

// These hooks are current placeholders (account-level nudges are re-implemented
// against the new Assets system in Task 8). The tests characterise the current
// behaviour: both hooks always return null. They act as regression guards so a
// future re-implementation surfaces intentionally rather than silently.

describe("useSavingsNudge", () => {
  it("returns null for non-savings_allocation item types", () => {
    const { result } = renderHook(() => useSavingsNudge("item-1", "committed_item", false));
    expect(result.current).toBeNull();
  });

  it("returns null for savings_allocation when read-only", () => {
    const { result } = renderHook(() => useSavingsNudge("item-1", "savings_allocation", true));
    expect(result.current).toBeNull();
  });

  it("returns null for an editable savings_allocation (placeholder — nudge not yet re-implemented)", () => {
    const { result } = renderHook(() => useSavingsNudge("item-1", "savings_allocation", false));
    expect(result.current).toBeNull();
  });

  it("ignores the itemId argument (does not affect the result)", () => {
    const a = renderHook(() => useSavingsNudge("", "savings_allocation", false));
    const b = renderHook(() => useSavingsNudge("some-other-id", "savings_allocation", false));
    expect(a.result.current).toBeNull();
    expect(b.result.current).toBeNull();
  });
});

describe("useWealthAccountNudge", () => {
  it("returns null regardless of the account passed", () => {
    const { result } = renderHook(() =>
      useWealthAccountNudge({ id: "acc-1", type: "Savings", growthRatePct: 4 })
    );
    expect(result.current).toBeNull();
  });

  it("returns null for a null/undefined account", () => {
    const { result } = renderHook(() => useWealthAccountNudge(null));
    expect(result.current).toBeNull();
  });
});
