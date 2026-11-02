/**
 * TierPage — realistic interaction (userEvent) + axe a11y coverage.
 *
 * Complements TierPage.test.tsx (shell/URL params, fireEvent-free) by driving
 * the highest-value flow — adding an item — through the same keyboard/pointer
 * sequencing a real user produces, and asserting the *submitted payload* rather
 * than testid presence. Also runs the serious/critical axe policy against the
 * fully-rendered page (previously out of a11y scope).
 */
import { describe, it, expect, mock } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expectNoA11yViolations } from "@/test/helpers/axe";
import TierPage from "../TierPage";

let _searchParams = new URLSearchParams();

mock.module("react-router-dom", () => ({
  useSearchParams: () => [
    _searchParams,
    (_next: URLSearchParams) => {
      _searchParams = _next;
    },
  ],
  useNavigate: () => () => {},
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={String(to)} {...props}>
      {children}
    </a>
  ),
}));

// Capture the payload the page submits so we assert real outcomes, not testids.
const createItemMutate = mock(async (payload: Record<string, unknown>) => ({
  id: "new-item",
  ...payload,
}));

mock.module("@/hooks/useWaterfall", () => ({
  useSubcategories: mock(() => ({
    isLoading: false,
    data: [{ id: "sub-1", name: "Housing", tier: "committed", sortOrder: 0, isLocked: false }],
  })),
  useTierItems: mock(() => ({ isLoading: false, data: [] })),
  useCreateItem: mock(() => ({ isPending: false, mutateAsync: createItemMutate })),
  useDeleteItem: mock(() => ({ isPending: false, mutateAsync: async () => {} })),
  useCreatePeriod: mock(() => ({ isPending: false, mutateAsync: async () => {} })),
  useDeletePeriod: mock(() => ({ isPending: false, mutateAsync: async () => {} })),
}));

mock.module("@/hooks/useSettings", () => ({
  useSettings: mock(() => ({ data: { showPence: false } })),
  useHouseholdMembers: mock(() => ({ data: [] })),
  getStalenessMonths: mock(() => 12),
}));

mock.module("@/hooks/useShortfall", () => ({
  useTierShortfall: mock(() => ({
    items: [],
    count: 0,
    daysToFirst: null,
    balanceToday: 0,
    lowest: null,
    isLive: false,
  })),
}));

mock.module("@/hooks/useGifts", () => ({
  useGiftPlannerSettings: mock(() => ({ data: undefined })),
}));

function renderTier(searchParams = new URLSearchParams()) {
  _searchParams = searchParams;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TierPage tier="committed" />
    </QueryClientProvider>
  );
}

describe("TierPage — add-item flow (userEvent)", () => {
  it("submits the typed name + amount when the user fills and saves the add form", async () => {
    const user = userEvent.setup();
    createItemMutate.mockClear();
    // ?add=1 opens the add form on mount (initialIsAdding).
    renderTier(new URLSearchParams("add=1"));

    // Save is disabled until a name is entered — verify the guard, then type.
    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByLabelText("Name"), "Council Tax");
    await user.type(screen.getByLabelText("Amount"), "180");

    expect((saveButton as HTMLButtonElement).disabled).toBe(false);
    await user.click(saveButton);

    await waitFor(() => {
      expect(createItemMutate).toHaveBeenCalledTimes(1);
    });
    const payload = createItemMutate.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.name).toBe("Council Tax");
    expect(payload.amount).toBe(180);
    expect(payload.subcategoryId).toBe("sub-1");
    // Committed tier requires a due date; the form defaults it to a real date.
    expect(payload.dueDate).toBeTruthy();
  });

  it("cancels the add form without submitting when the user clicks Cancel", async () => {
    const user = userEvent.setup();
    createItemMutate.mockClear();
    renderTier(new URLSearchParams("add=1"));

    await user.type(screen.getByLabelText("Name"), "Discarded");
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    // Cancel must never submit. (The form's exit is animated via framer-motion,
    // so we assert on the mutation rather than waiting for DOM removal.)
    expect(createItemMutate).not.toHaveBeenCalled();
  });
});

describe("TierPage — a11y (serious/critical)", () => {
  it("has no serious/critical axe violations in the default (list) view", async () => {
    const { container } = renderTier(new URLSearchParams());
    await expectNoA11yViolations(container);
  });

  it("has no serious/critical axe violations with the add form open", async () => {
    const { container } = renderTier(new URLSearchParams("add=1"));
    // Ensure the form has painted before scanning.
    await screen.findByLabelText("Name");
    await expectNoA11yViolations(container);
  });
});
