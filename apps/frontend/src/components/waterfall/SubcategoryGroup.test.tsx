import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { toMonthlyAmount } from "@finplan/shared";
import { formatCurrency } from "@/utils/format";
import { SubcategoryGroup } from "./SubcategoryGroup";

describe("SubcategoryGroup", () => {
  const subcategory = { id: "sub-1", name: "Housing", sortOrder: 0 };
  const items = [
    {
      id: "c-1",
      name: "Mortgage",
      amount: 1450,
      spendType: "monthly" as const,
      subcategoryId: "sub-1",
      notes: null,
      dueDate: null,
      lastReviewedAt: new Date(),
      createdAt: new Date(),
      sortOrder: 0,
    },
  ];

  it("renders subcategory name and group total", () => {
    render(
      <table>
        <tbody>
          <SubcategoryGroup
            tier="committed"
            subcategory={subcategory}
            items={items as any}
            members={[]}
            showPence={false}
            onAddDraft={() => {}}
            onDeleteItem={() => Promise.resolve()}
            onSaveName={() => Promise.resolve()}
            onSaveAmount={() => Promise.resolve()}
          />
        </tbody>
      </table>
    );
    expect(screen.getByText("Housing")).toBeInTheDocument();
    expect(screen.getByText(/£1,450/)).toBeInTheDocument();
  });

  it("computes monthly-equivalent total across mixed frequencies", () => {
    const mixed = [
      { ...items[0], id: "m-week", amount: 10, spendType: "weekly" as const },
      { ...items[0], id: "m-quarter", amount: 300, spendType: "quarterly" as const },
      { ...items[0], id: "m-year", amount: 1200, spendType: "yearly" as const },
      { ...items[0], id: "m-oneoff", amount: 500, spendType: "one_off" as const },
    ];
    const expected =
      toMonthlyAmount(10, "weekly") +
      toMonthlyAmount(300, "quarterly") +
      toMonthlyAmount(1200, "yearly") +
      toMonthlyAmount(500, "one_off");
    render(
      <table>
        <tbody>
          <SubcategoryGroup
            tier="committed"
            subcategory={subcategory}
            items={mixed as any}
            members={[]}
            showPence={false}
            onAddDraft={() => {}}
            onDeleteItem={() => Promise.resolve()}
            onSaveName={() => Promise.resolve()}
            onSaveAmount={() => Promise.resolve()}
          />
        </tbody>
      </table>
    );
    expect(
      screen.getByText(new RegExp(`${formatCurrency(expected, false)}/mo`))
    ).toBeInTheDocument();
  });

  it("renders + add ghost row at the end of items", () => {
    const onAddDraft = mock(() => {});
    render(
      <table>
        <tbody>
          <SubcategoryGroup
            tier="committed"
            subcategory={subcategory}
            items={items as any}
            members={[]}
            showPence={false}
            onAddDraft={onAddDraft}
            onDeleteItem={() => Promise.resolve()}
            onSaveName={() => Promise.resolve()}
            onSaveAmount={() => Promise.resolve()}
          />
        </tbody>
      </table>
    );
    const addBtn = screen.getByRole("button", { name: /add item to housing/i });
    fireEvent.click(addBtn);
    expect(onAddDraft).toHaveBeenCalledWith("sub-1");
  });
});
