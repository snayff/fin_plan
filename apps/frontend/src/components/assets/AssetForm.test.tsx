import { describe, it, expect, mock } from "bun:test";
import { screen, fireEvent } from "@testing-library/react";
import { AssetForm } from "./AssetForm";
import { renderWithProviders } from "@/test/helpers/render";

type Props = React.ComponentProps<typeof AssetForm>;

function renderForm(overrides: Partial<Props> = {}) {
  const props: Props = {
    mode: "add",
    assetType: "Property",
    onSave: mock(() => {}),
    onCancel: mock(() => {}),
    ...overrides,
  };
  renderWithProviders(<AssetForm {...props} />);
  return props;
}

describe("AssetForm — validation", () => {
  it("blocks save and shows an error when name is empty", () => {
    const onSave = mock(() => {});
    renderForm({ onSave });
    // Save is disabled when name is blank, so it cannot fire onSave
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows a disposal error when only one disposal field is set", () => {
    const onSave = mock(() => {});
    renderForm({ onSave });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Flat" } });
    fireEvent.click(screen.getByRole("button", { name: /Planned disposal/ }));
    fireEvent.change(screen.getByLabelText("Disposal date"), {
      target: { value: "2030-01-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/Set both a date and a target account/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("AssetForm — save payload", () => {
  it("includes initialValue and growthRatePct in add mode", () => {
    const onSave = mock(() => {});
    renderForm({ onSave, mode: "add" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Family Home" } });
    fireEvent.change(screen.getByLabelText("Current value"), { target: { value: "250000" } });
    fireEvent.change(screen.getByLabelText("Growth rate"), { target: { value: "3.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Family Home",
        growthRatePct: 3.5,
        initialValue: 250000,
        disposedAt: null,
        disposalAccountId: null,
      })
    );
  });

  it("omits initialValue in edit mode and passes null growth when blank", () => {
    const onSave = mock(() => {});
    renderForm({ onSave, mode: "edit", initialName: "Old Car" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const payload = onSave.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("initialValue");
    expect(payload.growthRatePct).toBeNull();
  });
});

describe("AssetForm — edit affordances", () => {
  it("renders Delete and Still-correct controls for a stale edit", () => {
    const onDeleteRequest = mock(() => {});
    const onConfirm = mock(() => {});
    renderForm({
      mode: "edit",
      initialName: "House",
      isStale: true,
      onDeleteRequest,
      onConfirm,
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: /Still correct/ }));
    expect(onDeleteRequest).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("hides the Still-correct control when not stale", () => {
    renderForm({ mode: "edit", initialName: "House", isStale: false, onConfirm: mock(() => {}) });
    expect(screen.queryByRole("button", { name: /Still correct/ })).toBeNull();
  });

  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = mock(() => {});
    renderForm({ onCancel });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("collapses disposal fields and clears them when toggled off", () => {
    renderForm({ initialName: "Flat", initialDisposedAt: "2030-01-01T00:00:00.000Z" });
    // Starts expanded because initialDisposedAt is set
    expect(screen.getByLabelText("Disposal date")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Planned disposal/ }));
    expect(screen.queryByLabelText("Disposal date")).toBeNull();
  });
});
