import { describe, it, expect, mock } from "bun:test";
import { render, screen } from "@testing-library/react";
import { TierRow } from "./TierRow";
import { columnCount } from "./tierRowFormat";

const mockItem = {
  id: "inc-1",
  name: "Ben — Salary",
  amount: 4200,
  spendType: "monthly" as const,
  subcategoryId: "sub-1",
  notes: null,
  dueDate: null,
  memberId: null,
  lastReviewedAt: new Date(),
  createdAt: new Date(),
  sortOrder: 0,
};

describe("TierRow (income)", () => {
  it("renders name and amount inputs", () => {
    render(
      <table>
        <tbody>
          <TierRow
            tier="income"
            item={mockItem as any}
            members={[]}
            showPence={false}
            onSaveName={mock(() => Promise.resolve())}
            onSaveAmount={mock(() => Promise.resolve())}
            onDelete={mock(() => Promise.resolve())}
          />
        </tbody>
      </table>
    );
    expect(screen.getByDisplayValue("Ben — Salary")).toBeInTheDocument();
    expect(screen.getByDisplayValue("4200")).toBeInTheDocument();
  });

  it("shows 'Household' in Assigned-to column when memberId is null", () => {
    render(
      <table>
        <tbody>
          <TierRow
            tier="income"
            item={{ ...mockItem, memberId: null } as any}
            members={[]}
            showPence={false}
            onSaveName={mock(() => Promise.resolve())}
            onSaveAmount={mock(() => Promise.resolve())}
            onDelete={mock(() => Promise.resolve())}
          />
        </tbody>
      </table>
    );
    expect(screen.getByText("Household")).toBeInTheDocument();
  });

  it("resolves member firstName from memberId on committed tier", () => {
    render(
      <table>
        <tbody>
          <TierRow
            tier="committed"
            item={{ ...mockItem, memberId: "m1" } as any}
            members={[{ id: "m1", firstName: "Alice", name: "Alice Smith" }]}
            showPence={false}
            onSaveName={mock(() => Promise.resolve())}
            onSaveAmount={mock(() => Promise.resolve())}
            onDelete={mock(() => Promise.resolve())}
          />
        </tbody>
      </table>
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("reveals trash icon button", () => {
    const { container } = render(
      <table>
        <tbody>
          <TierRow
            tier="income"
            item={mockItem as any}
            members={[]}
            showPence={false}
            onSaveName={mock(() => Promise.resolve())}
            onSaveAmount={mock(() => Promise.resolve())}
            onDelete={mock(() => Promise.resolve())}
          />
        </tbody>
      </table>
    );
    const row = container.querySelector("tr")!;
    expect(row.querySelector('[data-testid="row-delete-btn"]')).toBeInTheDocument();
  });

  it("displays '—' in Due column when no due date is set", () => {
    render(
      <table>
        <tbody>
          <TierRow
            tier="committed"
            item={{ ...mockItem, spendType: "monthly" } as any}
            members={[]}
            showPence={false}
            onSaveName={mock(() => Promise.resolve())}
            onSaveAmount={mock(() => Promise.resolve())}
            onDelete={mock(() => Promise.resolve())}
          />
        </tbody>
      </table>
    );
    const dueCell = screen.getByTestId("cell-due");
    expect(dueCell.textContent?.trim()).toBe("—");
  });

  function renderRow(tier: "income" | "committed" | "discretionary", overrides: object) {
    return render(
      <table>
        <tbody>
          <TierRow
            tier={tier}
            item={{ ...mockItem, ...overrides } as any}
            members={[]}
            showPence={false}
            onSaveName={mock(() => Promise.resolve())}
            onSaveAmount={mock(() => Promise.resolve())}
            onDelete={mock(() => Promise.resolve())}
          />
        </tbody>
      </table>
    );
  }

  it("does not divide monthly amounts again in the /month column", () => {
    renderRow("committed", { amount: 1200, spendType: "monthly" });
    expect(screen.getByTestId("cell-monthly").textContent).toBe("£1,200");
  });

  it("divides yearly amounts by 12 in the /month column", () => {
    renderRow("committed", { amount: 1200, spendType: "yearly" });
    expect(screen.getByTestId("cell-monthly").textContent).toBe("£100");
  });

  it("converts non-monthly income to a monthly equivalent", () => {
    renderRow("income", { amount: 12000, spendType: "yearly" });
    expect(screen.getByTestId("cell-monthly").textContent).toBe("£1,000");
  });

  it("shows a due date for every cadence, not just yearly", () => {
    const due = new Date(2026, 2, 15);
    const { unmount } = renderRow("committed", { spendType: "monthly", dueDate: due });
    expect(screen.getByTestId("cell-due").textContent).toBe("15th");
    unmount();
    renderRow("committed", { spendType: "yearly", dueDate: due });
    expect(screen.getByTestId("cell-due").textContent).toBe("15 Mar");
  });

  it("renders cells in header order: name, type, cadence, due, member, amount, /month", () => {
    const { container } = renderRow("income", { incomeType: "salary", spendType: "monthly" });
    const cells = Array.from(container.querySelectorAll("tr:first-child > td"));
    expect(cells).toHaveLength(columnCount("income"));
    expect(cells[1]!.textContent).toBe("Salary");
    expect(cells[2]!.textContent).toBe("Monthly");
    expect(cells[4]!.textContent).toBe("Household");
    expect(cells[5]!.querySelector("input")?.getAttribute("aria-label")).toBe("Amount");
  });
});
