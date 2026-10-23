import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";

mock.module("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: { showPence: false } }),
}));

import { AssetsLeftPanel } from "./AssetsLeftPanel";
import { keyToSelection, selectionToKey } from "./assetsSelection";

const summary = {
  assetTotals: { Property: 0, Vehicle: 0, Other: 500 },
  accountTotals: { Current: 0, Savings: 0, Pension: 0, StocksAndShares: 0, Other: 1200 },
  grandTotal: 1700,
};

function otherRows() {
  return screen.getAllByRole("button").filter((b) => b.textContent?.startsWith("Other"));
}

describe("AssetsLeftPanel — 'Other' exists in both groups", () => {
  it("highlights only the account 'Other' row when it is selected", () => {
    render(
      <AssetsLeftPanel
        summary={summary as any}
        selected={{ kind: "account", type: "Other" }}
        onSelect={() => {}}
      />
    );
    const [assetOther, accountOther] = otherRows();
    expect(assetOther!.getAttribute("aria-current")).toBeNull();
    expect(accountOther!.getAttribute("aria-current")).toBe("true");
    expect(accountOther!.textContent).toContain("£1,200");
  });

  it("reports which group's 'Other' was clicked", () => {
    const onSelect = mock(() => {});
    render(
      <AssetsLeftPanel
        summary={summary as any}
        selected={{ kind: "asset", type: "Property" }}
        onSelect={onSelect}
      />
    );
    const [assetOther, accountOther] = otherRows();
    fireEvent.click(accountOther!);
    expect(onSelect).toHaveBeenLastCalledWith({ kind: "account", type: "Other" });
    fireEvent.click(assetOther!);
    expect(onSelect).toHaveBeenLastCalledWith({ kind: "asset", type: "Other" });
  });
});

describe("assetsSelection URL keys", () => {
  it("round-trips both 'Other' selections distinctly", () => {
    const asset = selectionToKey({ kind: "asset", type: "Other" });
    const account = selectionToKey({ kind: "account", type: "Other" });
    expect(asset).not.toBe(account);
    expect(keyToSelection(asset)).toEqual({ kind: "asset", type: "Other" });
    expect(keyToSelection(account)).toEqual({ kind: "account", type: "Other" });
  });

  it("keeps existing bare keys for unique types", () => {
    expect(keyToSelection("Savings")).toEqual({ kind: "account", type: "Savings" });
    expect(selectionToKey({ kind: "asset", type: "Property" })).toBe("Property");
    expect(keyToSelection("Nonsense")).toBeNull();
  });
});
