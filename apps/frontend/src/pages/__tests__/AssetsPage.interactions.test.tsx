/**
 * AssetsPage — realistic interaction (userEvent) + axe a11y coverage.
 *
 * Complements AssetsPage.params.test.tsx (URL ?add= handling) by driving the
 * add-asset flow through real typing/clicking and asserting the *submitted
 * payload* (createAsset args), plus running the serious/critical axe policy
 * against the fully-rendered page — previously out of a11y scope.
 */
import { describe, it, expect, mock } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expectNoA11yViolations } from "@/test/helpers/axe";
import AssetsPage from "../AssetsPage";

let _searchParams = new URLSearchParams();

mock.module("react-router-dom", () => ({
  useSearchParams: () => [_searchParams, (_next: URLSearchParams) => {}],
}));

// Capture the payload the page submits so we assert real outcomes.
const createAssetMutate = mock(async (payload: Record<string, unknown>) => ({
  id: "new-asset",
  ...payload,
}));

mock.module("../../hooks/useAssets.js", () => ({
  useAssetsSummary: mock(() => ({ data: null, isLoading: false })),
  useAssetsByType: mock(() => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: async () => {},
  })),
  useAccountsByType: mock(() => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: async () => {},
  })),
  useAllAccounts: mock(() => ({ data: [], isLoading: false })),
  useCreateAsset: mock(() => ({ isPending: false, mutateAsync: createAssetMutate })),
  useUpdateAsset: mock(() => ({ isPending: false, mutateAsync: async () => {} })),
  useDeleteAsset: mock(() => ({ isPending: false, mutateAsync: async () => {} })),
  useRecordAssetBalance: mock(() => ({ isPending: false, mutateAsync: async () => {} })),
  useConfirmAsset: mock(() => ({ isPending: false, mutateAsync: async () => {} })),
  useCreateAccount: mock(() => ({ isPending: false, mutateAsync: async () => {} })),
  useUpdateAccount: mock(() => ({ isPending: false, mutateAsync: async () => {} })),
  useDeleteAccount: mock(() => ({ isPending: false, mutateAsync: async () => {} })),
  useRecordAccountBalance: mock(() => ({ isPending: false, mutateAsync: async () => {} })),
  useConfirmAccount: mock(() => ({ isPending: false, mutateAsync: async () => {} })),
}));

mock.module("@/hooks/useSettings", () => ({
  useSettings: mock(() => ({ data: { showPence: false } })),
  useHouseholdMembers: mock(() => ({ data: [] })),
  getStalenessMonths: mock(() => 12),
}));

mock.module("@/hooks/useHousehold", () => ({
  useHouseholdMembers: mock(() => ({ data: [], isLoading: false })),
}));

function renderAt(searchParams: URLSearchParams) {
  _searchParams = searchParams;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AssetsPage />
    </QueryClientProvider>
  );
}

describe("AssetsPage — add-asset flow (userEvent)", () => {
  it("submits the typed name, value and growth rate when the user fills and saves", async () => {
    const user = userEvent.setup();
    createAssetMutate.mockClear();
    // ?add=asset opens the add form on the Property (default) view.
    renderAt(new URLSearchParams("add=asset"));

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    // Save is guarded until a name exists.
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByLabelText("Name"), "Family Home");
    await user.type(screen.getByLabelText("Current value"), "350000");
    await user.type(screen.getByLabelText("Growth rate"), "3.5");

    expect((saveButton as HTMLButtonElement).disabled).toBe(false);
    await user.click(saveButton);

    await waitFor(() => {
      expect(createAssetMutate).toHaveBeenCalledTimes(1);
    });
    const payload = createAssetMutate.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.name).toBe("Family Home");
    expect(payload.type).toBe("Property");
    expect(payload.initialValue).toBe(350000);
    expect(payload.growthRatePct).toBe(3.5);
  });

  it("does not submit when the user opens then cancels the add form", async () => {
    const user = userEvent.setup();
    createAssetMutate.mockClear();
    renderAt(new URLSearchParams("add=asset"));

    await user.type(screen.getByLabelText("Name"), "Discarded");
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(createAssetMutate).not.toHaveBeenCalled();
  });
});

describe("AssetsPage — a11y (serious/critical)", () => {
  it("has no serious/critical axe violations in the default view", async () => {
    const { container } = renderAt(new URLSearchParams());
    await expectNoA11yViolations(container);
  });

  it("has no serious/critical axe violations with the add-asset form open", async () => {
    const { container } = renderAt(new URLSearchParams("add=asset"));
    await screen.findByLabelText("Name");
    await expectNoA11yViolations(container);
  });
});
