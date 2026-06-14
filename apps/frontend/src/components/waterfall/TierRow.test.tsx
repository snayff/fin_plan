import { describe, it, expect, mock } from "bun:test";
import { render, screen } from "@testing-library/react";
import { TierRow } from "./TierRow";

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

  it("displays '—' in Due column for monthly cadence (committed tier)", () => {
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
});
