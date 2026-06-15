import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountForm } from "../AccountForm";

function renderForm(props: React.ComponentProps<typeof AccountForm>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AccountForm {...props} />
    </QueryClientProvider>
  );
}

describe("AccountForm — ISA fields", () => {
  it("does not render the Is ISA toggle for non-Savings types", () => {
    renderForm({
      mode: "add",
      type: "Current",
      onSave: mock(() => {}),
      onCancel: mock(() => {}),
    });
    expect(screen.queryByLabelText(/Is ISA/i)).toBeNull();
  });

  it("renders the Is ISA toggle for Savings type", () => {
    renderForm({
      mode: "add",
      type: "Savings",
      onSave: mock(() => {}),
      onCancel: mock(() => {}),
    });
    expect(screen.getByLabelText(/Is ISA/i)).toBeInTheDocument();
  });

  it("blocks save when Is ISA is on but no member is assigned", () => {
    const onSave = mock(() => {});
    renderForm({ mode: "add", type: "Savings", onSave, onCancel: mock(() => {}) });
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: "Cash ISA" } });
    fireEvent.click(screen.getByLabelText(/Is ISA/i));
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/must be assigned to a member/i)).toBeInTheDocument();
  });

  it("blocks save for a Pension with no member assigned", () => {
    const onSave = mock(() => {});
    renderForm({ mode: "add", type: "Pension", onSave, onCancel: mock(() => {}) });
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: "Vanguard SIPP" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/pension.*assigned to a member/i)).toBeInTheDocument();
  });

  it("allows save for a Pension when a member is assigned", () => {
    const onSave = mock(() => {});
    renderForm({
      mode: "add",
      type: "Pension",
      initialMemberId: "m1",
      onSave,
      onCancel: mock(() => {}),
    });
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: "Vanguard SIPP" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ memberId: "m1" }));
  });

  it("does not block save for non-Pension types with no member", () => {
    const onSave = mock(() => {});
    renderForm({ mode: "add", type: "Current", onSave, onCancel: mock(() => {}) });
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: "Barclays" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(onSave).toHaveBeenCalled();
  });

  it("surfaces a gentle prompt when editing an unassigned Pension", () => {
    renderForm({
      mode: "edit",
      type: "Pension",
      initialName: "Old SIPP",
      initialMemberId: null,
      onSave: mock(() => {}),
      onCancel: mock(() => {}),
    });
    expect(screen.getByText(/belongs to a single person/i)).toBeInTheDocument();
  });

  it("includes isISA and isaYearContribution in onSave payload", () => {
    const onSave = mock(() => {});
    // Pass initialMemberId so the select is pre-seeded with a member — avoids the
    // happy-dom controlled-select quirk where fireEvent.change won't persist a value
    // that isn't in the <option> list.
    renderForm({
      mode: "add",
      type: "Savings",
      initialMemberId: "m1",
      onSave,
      onCancel: mock(() => {}),
    });
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: "Cash ISA" } });
    fireEvent.click(screen.getByLabelText(/Is ISA/i));
    fireEvent.change(screen.getByLabelText(/ISA contribution this tax year/i), {
      target: { value: "5000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ isISA: true, isaYearContribution: 5000 })
    );
  });
});
