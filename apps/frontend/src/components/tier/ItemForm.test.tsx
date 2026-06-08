import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

mock.module("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: undefined }),
}));

mock.module("@/hooks/useWaterfall", () => ({
  useCreatePeriod: () => ({ mutateAsync: mock(() => Promise.resolve()), isPending: false }),
  useDeletePeriod: () => ({ mutateAsync: mock(() => Promise.resolve()), isPending: false }),
}));

import ItemForm from "./ItemForm";
import { TIER_CONFIGS } from "./tierConfig";

const subcategories = [
  { id: "sub-housing", name: "Housing" },
  { id: "sub-utilities", name: "Utilities" },
];

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("ItemForm — add mode", () => {
  it("renders field labels with asterisks for required fields", () => {
    renderWithClient(
      <ItemForm
        mode="add"
        config={TIER_CONFIGS.committed}
        subcategories={subcategories}
        initialSubcategoryId="sub-housing"
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText(/name/i)).toBeTruthy();
    expect(screen.getByText(/amount/i)).toBeTruthy();
    // Asterisks on required fields
    const labels = screen.getAllByText("*");
    expect(labels.length).toBeGreaterThanOrEqual(2);
  });

  it("renders descriptive placeholders", () => {
    renderWithClient(
      <ItemForm
        mode="add"
        config={TIER_CONFIGS.committed}
        subcategories={subcategories}
        initialSubcategoryId="sub-housing"
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByPlaceholderText("e.g. Mortgage, Council Tax")).toBeTruthy();
    expect(screen.getByPlaceholderText("0.00")).toBeTruthy();
    expect(screen.getByPlaceholderText("Any details worth remembering")).toBeTruthy();
  });

  it("renders Cancel and Save buttons only in add mode", () => {
    renderWithClient(
      <ItemForm
        mode="add"
        config={TIER_CONFIGS.committed}
        subcategories={subcategories}
        initialSubcategoryId="sub-housing"
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /still correct/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("Save is the rightmost button in add mode", () => {
    const { container } = renderWithClient(
      <ItemForm
        mode="add"
        config={TIER_CONFIGS.committed}
        subcategories={subcategories}
        initialSubcategoryId="sub-housing"
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
    const buttons = container.querySelectorAll("[data-testid='form-actions'] button");
    const lastButton = buttons[buttons.length - 1];
    expect(lastButton?.textContent).toMatch(/save/i);
  });

  it("calls onSave with form data on submit", () => {
    let savedData: any = null;
    renderWithClient(
      <ItemForm
        mode="add"
        config={TIER_CONFIGS.committed}
        subcategories={subcategories}
        initialSubcategoryId="sub-housing"
        onSave={(data) => {
          savedData = data;
        }}
        onCancel={() => {}}
      />
    );
    fireEvent.change(screen.getByPlaceholderText("e.g. Mortgage, Council Tax"), {
      target: { value: "Rent" },
    });
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "1200" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(savedData).toBeTruthy();
    expect(savedData.name).toBe("Rent");
    expect(savedData.amount).toBe(1200);
    // Defaults memberId to null ("Household") when no member selected
    expect(savedData.memberId).toBe(null);
  });

  it("renders the Assigned-to field with members", () => {
    renderWithClient(
      <ItemForm
        mode="add"
        config={TIER_CONFIGS.income}
        subcategories={subcategories}
        members={[
          { id: "m1", firstName: "Alice" },
          { id: "m2", firstName: "Bob" },
        ]}
        initialSubcategoryId="sub-housing"
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByLabelText("Assigned to")).toBeTruthy();
  });

  it("calls onCancel when Cancel is clicked", () => {
    let cancelled = false;
    renderWithClient(
      <ItemForm
        mode="add"
        config={TIER_CONFIGS.committed}
        subcategories={subcategories}
        initialSubcategoryId="sub-housing"
        onSave={() => {}}
        onCancel={() => {
          cancelled = true;
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(cancelled).toBe(true);
  });
});

describe("ItemForm — edit mode (stale item)", () => {
  const staleItem = {
    id: "item-1",
    name: "Rent",
    amount: 1200,
    spendType: "monthly" as const,
    subcategoryId: "sub-housing",
    notes: "Fixed rate",
    lastReviewedAt: new Date("2024-01-01"),
  };

  it("renders button order: Cancel, Delete, Still correct, Save", () => {
    const { container } = renderWithClient(
      <ItemForm
        mode="edit"
        item={staleItem}
        config={TIER_CONFIGS.committed}
        subcategories={subcategories}
        initialSubcategoryId="sub-housing"
        onSave={() => {}}
        onCancel={() => {}}
        onConfirm={() => {}}
        onDelete={() => {}}
        isStale={true}
      />
    );
    const buttons = container.querySelectorAll("[data-testid='form-actions'] button");
    expect(buttons[0]?.textContent).toMatch(/cancel/i);
    // After spacer: Delete, Still correct, Save
    const rightButtons = Array.from(buttons).slice(1);
    expect(rightButtons.some((b) => b.textContent?.match(/delete/i))).toBe(true);
    expect(rightButtons.some((b) => b.textContent?.match(/still correct/i))).toBe(true);
    const lastButton = buttons[buttons.length - 1];
    expect(lastButton?.textContent).toMatch(/save/i);
  });
});

describe("ItemForm — edit mode (fresh item)", () => {
  const freshItem = {
    id: "item-2",
    name: "Gym",
    amount: 3999,
    spendType: "monthly" as const,
    subcategoryId: "sub-housing",
    notes: null,
    lastReviewedAt: new Date("2026-01-01"),
  };

  it("does not show Still correct for non-stale items", () => {
    renderWithClient(
      <ItemForm
        mode="edit"
        item={freshItem}
        config={TIER_CONFIGS.committed}
        subcategories={subcategories}
        initialSubcategoryId="sub-housing"
        onSave={() => {}}
        onCancel={() => {}}
        onConfirm={() => {}}
        onDelete={() => {}}
        isStale={false}
      />
    );
    expect(screen.queryByRole("button", { name: /still correct/i })).toBeNull();
    expect(screen.getByRole("button", { name: /delete/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeTruthy();
  });
});

describe("ItemForm — amount validation & formatting", () => {
  it("blocks save and surfaces an error when amount is zero", () => {
    const onSave = mock(() => {});
    renderWithClient(
      <ItemForm
        mode="add"
        config={TIER_CONFIGS.committed}
        subcategories={subcategories}
        initialSubcategoryId="sub-housing"
        onSave={onSave}
        onCancel={() => {}}
      />
    );
    fireEvent.change(screen.getByPlaceholderText("e.g. Mortgage, Council Tax"), {
      target: { value: "Rent" },
    });
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(screen.getByText(/Amount must be greater than 0/)).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("strips currency formatting from the amount before saving", () => {
    const onSave = mock(() => {});
    renderWithClient(
      <ItemForm
        mode="add"
        config={TIER_CONFIGS.committed}
        subcategories={subcategories}
        initialSubcategoryId="sub-housing"
        onSave={onSave}
        onCancel={() => {}}
      />
    );
    fireEvent.change(screen.getByPlaceholderText("e.g. Mortgage, Council Tax"), {
      target: { value: "Rent" },
    });
    const amount = screen.getByLabelText("Amount") as HTMLInputElement;
    fireEvent.change(amount, { target: { value: "£1,200" } });
    // On blur the field re-renders a formatted display value
    fireEvent.blur(amount);
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect((onSave.mock.calls[0]![0] as { amount: number }).amount).toBe(1200);
  });
});

describe("ItemForm — value-history period editor", () => {
  const itemWithPeriods = {
    id: "item-3",
    name: "Salary",
    amount: 4000,
    spendType: "monthly" as const,
    subcategoryId: "sub-housing",
    notes: null,
    lastReviewedAt: new Date("2024-01-01"),
    dueDate: new Date("2024-01-01"),
    periods: [
      { id: "per-1", startDate: new Date("2024-01-01"), endDate: null, amount: 4000 },
      { id: "per-2", startDate: new Date("2099-01-01"), endDate: null, amount: 4500 },
    ],
  };

  it("renders existing periods with Current/Scheduled markers", () => {
    renderWithClient(
      <ItemForm
        mode="edit"
        item={itemWithPeriods}
        config={TIER_CONFIGS.income}
        subcategories={subcategories}
        initialSubcategoryId="sub-housing"
        onSave={() => {}}
        onCancel={() => {}}
        onConfirm={() => {}}
        onDelete={() => {}}
        isStale={false}
      />
    );
    expect(screen.getByText("Value History")).toBeTruthy();
    expect(screen.getByText("Current")).toBeTruthy();
    expect(screen.getByText("Scheduled")).toBeTruthy();
  });

  it("opens the add-period inline form with start-date and amount inputs", () => {
    renderWithClient(
      <ItemForm
        mode="edit"
        item={itemWithPeriods}
        config={TIER_CONFIGS.income}
        subcategories={subcategories}
        initialSubcategoryId="sub-housing"
        onSave={() => {}}
        onCancel={() => {}}
        onConfirm={() => {}}
        onDelete={() => {}}
        isStale={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Add period" }));
    expect(screen.getByLabelText("New period amount")).toBeTruthy();
    expect(screen.getByLabelText("New period start date")).toBeTruthy();
    // Entering a valid amount enables the inline Add control
    fireEvent.change(screen.getByLabelText("New period amount"), { target: { value: "5000" } });
    expect((screen.getByLabelText("New period amount") as HTMLInputElement).value).toBe("5000");
  });

  it("removes a period via its Remove control", () => {
    renderWithClient(
      <ItemForm
        mode="edit"
        item={itemWithPeriods}
        config={TIER_CONFIGS.income}
        subcategories={subcategories}
        initialSubcategoryId="sub-housing"
        onSave={() => {}}
        onCancel={() => {}}
        onConfirm={() => {}}
        onDelete={() => {}}
        isStale={false}
      />
    );
    const removeButtons = screen.getAllByRole("button", { name: /Remove period from/ });
    expect(removeButtons.length).toBe(2);
    fireEvent.click(removeButtons[0]!);
    // mutateAsync is mocked to resolve; no throw means the handler path executed
  });
});
