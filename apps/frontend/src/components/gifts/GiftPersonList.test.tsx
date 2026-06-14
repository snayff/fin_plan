import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";

mock.module("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: { showPence: false } }),
}));

import { GiftPersonList } from "./GiftPersonList";

const sample = [
  {
    id: "p1",
    name: "Mum",
    notes: null,
    sortOrder: 0,
    isHouseholdMember: true,
    plannedCount: 2,
    boughtCount: 1,
    plannedTotal: 150,
    spentTotal: 60,
    hasOverspend: false,
  },
  {
    id: "p2",
    name: "Dad",
    notes: null,
    sortOrder: 1,
    isHouseholdMember: false,
    plannedCount: 0,
    boughtCount: 3,
    plannedTotal: 300,
    spentTotal: 320,
    hasOverspend: true,
  },
];

describe("GiftPersonList", () => {
  it("renders one row per person with name and totals", () => {
    render(<GiftPersonList people={sample as any} onSelect={() => {}} />);
    expect(screen.getByText("Mum")).toBeInTheDocument();
    expect(screen.getByText("Dad")).toBeInTheDocument();
    expect(screen.getByTestId("person-row-p1")).toHaveTextContent("£150");
  });

  it("shows household badge for linked members", () => {
    render(<GiftPersonList people={sample as any} onSelect={() => {}} />);
    const mum = screen.getByTestId("person-row-p1");
    expect(mum).toHaveTextContent(/household/i);
  });

  it("renders amber dot when row has overspend", () => {
    render(<GiftPersonList people={sample as any} onSelect={() => {}} />);
    expect(screen.getByTestId("overspend-dot-p2")).toBeInTheDocument();
    expect(screen.queryByTestId("overspend-dot-p1")).toBeNull();
  });

  it("invokes onSelect with the person id when row is clicked", () => {
    const onSelect = mock(() => {});
    render(<GiftPersonList people={sample as any} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("person-row-p1"));
    expect(onSelect).toHaveBeenCalledWith("p1");
  });

  it("renders empty state when no people", () => {
    render(<GiftPersonList people={[]} onSelect={() => {}} />);
    expect(screen.getByText(/select a person to start planning/i)).toBeInTheDocument();
  });
});
