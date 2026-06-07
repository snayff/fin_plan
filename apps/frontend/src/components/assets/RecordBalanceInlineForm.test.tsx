import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { RecordBalanceInlineForm } from "./RecordBalanceInlineForm";

function todayISO() {
  return new Date().toISOString().split("T")[0]!;
}

describe("RecordBalanceInlineForm", () => {
  it("validates that a value greater than zero is required", () => {
    const onSave = mock(() => {});
    render(<RecordBalanceInlineForm onSave={onSave} onCancel={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Value must be greater than 0")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves a valid balance, defaulting an empty note to null", () => {
    const onSave = mock(() => {});
    render(<RecordBalanceInlineForm onSave={onSave} onCancel={() => {}} />);

    fireEvent.change(screen.getByLabelText("Balance value"), { target: { value: "1500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({ value: 1500, date: todayISO(), note: null });
  });

  it("trims and forwards a provided note", () => {
    const onSave = mock(() => {});
    render(<RecordBalanceInlineForm onSave={onSave} onCancel={() => {}} />);

    fireEvent.change(screen.getByLabelText("Balance value"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "  year end  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({ value: 200, date: todayISO(), note: "year end" });
  });

  it("rejects a future date", () => {
    const onSave = mock(() => {});
    render(<RecordBalanceInlineForm onSave={onSave} onCancel={() => {}} />);

    fireEvent.change(screen.getByLabelText("Balance value"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Balance date"), { target: { value: "2999-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Date cannot be in the future")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("invokes onCancel from the cancel button", () => {
    const onCancel = mock(() => {});
    render(<RecordBalanceInlineForm onSave={() => {}} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows a saving state and disables the save button", () => {
    render(<RecordBalanceInlineForm isSaving onSave={() => {}} onCancel={() => {}} />);
    const saveBtn = screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });
});
