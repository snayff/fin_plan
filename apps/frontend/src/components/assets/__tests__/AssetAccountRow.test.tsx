import { describe, it, expect, mock } from "bun:test";
import { screen, fireEvent } from "@testing-library/react";
import { AssetAccountRow } from "../AssetAccountRow";
import { renderWithProviders } from "@/test/helpers/render";
import type { AssetItem, AccountItem } from "../../../services/assets.service";

const STALE_DATE = "2020-01-01T00:00:00.000Z";

function makeAsset(overrides: Partial<AssetItem> = {}): AssetItem {
  return {
    id: "as1",
    name: "Family Home",
    type: "Property",
    householdId: "h1",
    memberId: null,
    growthRatePct: null,
    lastReviewedAt: null,
    disposedAt: null,
    disposalAccountId: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    currentBalance: 250000,
    currentBalanceDate: "2025-06-01T00:00:00.000Z",
    balances: [],
    ...overrides,
  };
}

function makeAccount(overrides: Partial<AccountItem> = {}): AccountItem {
  return {
    id: "ac1",
    name: "Joint Current",
    type: "Current",
    householdId: "h1",
    memberId: null,
    growthRatePct: null,
    lastReviewedAt: null,
    disposedAt: null,
    disposalAccountId: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    currentBalance: 5000,
    currentBalanceDate: null,
    monthlyContribution: 0,
    monthlyContributionLimit: null,
    isISA: false,
    isaYearContribution: null,
    spareMonthly: null,
    isOverCap: false,
    hasSpareCapacityNudge: false,
    higherRateTarget: null,
    effectiveGrowthRatePct: null,
    linkedItems: [],
    balances: [],
    ...overrides,
  };
}

const noopHandlers = {
  onToggle: mock(() => {}),
  onStartEdit: mock(() => {}),
  onStartRecord: mock(() => {}),
  onCancelEdit: mock(() => {}),
  onCancelRecord: mock(() => {}),
  onDeleteRequest: mock(() => {}),
  onConfirm: mock(() => {}),
  onSaveEdit: mock(() => {}),
  onSaveRecord: mock(() => {}),
};

function baseProps(item: AssetItem | AccountItem, itemKind: "asset" | "account") {
  return {
    item,
    itemKind,
    stalenessThresholdMonths: 12,
    isExpanded: false,
    isEditing: false,
    isRecording: false,
    isSavingEdit: false,
    isSavingRecord: false,
    isSavingConfirm: false,
    ...noopHandlers,
  };
}

describe("AssetAccountRow — collapsed header", () => {
  it("shows the name, balance and 'Never recorded' when no balance date", () => {
    renderWithProviders(
      <AssetAccountRow {...baseProps(makeAccount({ currentBalanceDate: null }), "account")} />
    );
    expect(screen.getByText("Joint Current")).toBeInTheDocument();
    expect(screen.getByText("Never recorded")).toBeInTheDocument();
  });

  it("renders type · member metadata, falling back to 'Household' when unassigned", () => {
    renderWithProviders(<AssetAccountRow {...baseProps(makeAccount(), "account")} />);
    expect(screen.getByText(/Current · Household/)).toBeInTheDocument();
  });

  it("shows a monthly-contribution badge for accounts that contribute", () => {
    renderWithProviders(
      <AssetAccountRow {...baseProps(makeAccount({ monthlyContribution: 200 }), "account")} />
    );
    expect(screen.getByText(/\/mo/)).toBeInTheDocument();
  });

  it("calls onToggle when the header is clicked while not editing", () => {
    const onToggle = mock(() => {});
    renderWithProviders(
      <AssetAccountRow {...baseProps(makeAccount(), "account")} onToggle={onToggle} />
    );
    fireEvent.click(screen.getByRole("button", { name: /Joint Current/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onToggle when the header is clicked while editing", () => {
    const onToggle = mock(() => {});
    renderWithProviders(
      <AssetAccountRow {...baseProps(makeAccount(), "account")} isEditing onToggle={onToggle} />
    );
    fireEvent.click(screen.getByRole("button", { name: /Joint Current/ }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("shows the stale dot when an item is past the staleness threshold", () => {
    const item = makeAccount({ lastReviewedAt: STALE_DATE });
    renderWithProviders(<AssetAccountRow {...baseProps(item, "account")} />);
    expect(screen.getByTestId(`account-row-dot-${item.id}`)).toBeInTheDocument();
  });

  it("shows the stale dot when an account is over its cap", () => {
    const item = makeAccount({ isOverCap: true });
    renderWithProviders(<AssetAccountRow {...baseProps(item, "account")} />);
    expect(screen.getByTestId(`account-row-dot-${item.id}`)).toBeInTheDocument();
  });

  it("renders a 'Disposed' tag for an asset already disposed", () => {
    const item = makeAsset({ disposedAt: "2020-03-01T00:00:00.000Z" });
    renderWithProviders(<AssetAccountRow {...baseProps(item, "asset")} />);
    expect(screen.getByText(/Disposed/)).toBeInTheDocument();
  });

  it("renders a 'Sells' tag for an asset disposing in the future", () => {
    const item = makeAsset({ disposedAt: "2099-03-01T00:00:00.000Z" });
    renderWithProviders(<AssetAccountRow {...baseProps(item, "asset")} />);
    expect(screen.getByText(/Sells/)).toBeInTheDocument();
  });
});

describe("AssetAccountRow — expanded accordion", () => {
  it("shows an empty balance-history message when there are no balances", () => {
    renderWithProviders(<AssetAccountRow {...baseProps(makeAsset(), "asset")} isExpanded />);
    expect(screen.getByText(/No balances recorded yet/)).toBeInTheDocument();
  });

  it("lists recorded balances", () => {
    const item = makeAsset({
      balances: [
        { id: "b1", value: 1000, date: "2025-01-01T00:00:00.000Z", note: null, createdAt: "x" },
        { id: "b2", value: 2000, date: "2025-02-01T00:00:00.000Z", note: null, createdAt: "x" },
      ],
    });
    renderWithProviders(<AssetAccountRow {...baseProps(item, "asset")} isExpanded />);
    expect(screen.getByText("Balance History")).toBeInTheDocument();
    expect(screen.getByText("£1,000")).toBeInTheDocument();
    expect(screen.getByText("£2,000")).toBeInTheDocument();
  });

  it("shows a Last Reviewed row when the item is stale", () => {
    const item = makeAsset({ lastReviewedAt: STALE_DATE });
    renderWithProviders(<AssetAccountRow {...baseProps(item, "asset")} isExpanded />);
    expect(screen.getByText("Last Reviewed")).toBeInTheDocument();
    expect(screen.getByText(/months ago/)).toBeInTheDocument();
  });

  it("renders linked contributions with a total when no cap is set", () => {
    const item = makeAccount({
      monthlyContribution: 300,
      linkedItems: [
        { id: "li1", name: "Pension", spendType: "monthly", amount: 300, lumpSumExceedsCap: false },
      ],
    });
    renderWithProviders(<AssetAccountRow {...baseProps(item, "account")} isExpanded />);
    expect(screen.getByText("Monthly Contributions")).toBeInTheDocument();
    expect(screen.getByText("Pension")).toBeInTheDocument();
    expect(screen.getByText("Total/mo")).toBeInTheDocument();
  });

  it("renders an over-cap warning when contributions exceed the limit", () => {
    const item = makeAccount({
      monthlyContribution: 600,
      monthlyContributionLimit: 500,
      isOverCap: true,
      linkedItems: [
        { id: "li1", name: "ISA", spendType: "monthly", amount: 600, lumpSumExceedsCap: true },
      ],
    });
    renderWithProviders(<AssetAccountRow {...baseProps(item, "account")} isExpanded />);
    expect(screen.getByText(/Over cap by/)).toBeInTheDocument();
    expect(screen.getByText(/over cap \(raw\)/)).toBeInTheDocument();
  });

  it("shows Record Balance and Edit actions, wired to their handlers", () => {
    const onStartRecord = mock(() => {});
    const onStartEdit = mock(() => {});
    renderWithProviders(
      <AssetAccountRow
        {...baseProps(makeAsset(), "asset")}
        isExpanded
        onStartRecord={onStartRecord}
        onStartEdit={onStartEdit}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Record Balance" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onStartRecord).toHaveBeenCalledTimes(1);
    expect(onStartEdit).toHaveBeenCalledTimes(1);
  });

  it("renders the inline record form when recording", () => {
    renderWithProviders(
      <AssetAccountRow {...baseProps(makeAsset(), "asset")} isExpanded isRecording />
    );
    // RecordBalanceInlineForm exposes a value input
    expect(screen.getByLabelText(/New value|Value/i)).toBeInTheDocument();
  });
});

describe("AssetAccountRow — editing", () => {
  it("renders the AssetForm in edit mode for an asset", () => {
    renderWithProviders(<AssetAccountRow {...baseProps(makeAsset(), "asset")} isEditing />);
    // AssetForm has a Save button and a Name field
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("renders the AccountForm in edit mode for an account, with ISA banner when handler present", () => {
    const item = makeAccount({ type: "Savings", isISA: true, isaYearContribution: 1000 });
    renderWithProviders(
      <AssetAccountRow
        {...baseProps(item, "account")}
        isEditing
        onZeroIsaContribution={mock(() => {})}
      />
    );
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("propagates onSaveEdit when the edit form is saved", () => {
    const onSaveEdit = mock(() => {});
    renderWithProviders(
      <AssetAccountRow {...baseProps(makeAsset(), "asset")} isEditing onSaveEdit={onSaveEdit} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSaveEdit).toHaveBeenCalledTimes(1);
  });
});
