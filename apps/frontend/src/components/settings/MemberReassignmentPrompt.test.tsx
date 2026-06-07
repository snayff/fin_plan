import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemberReassignmentPrompt } from "./MemberReassignmentPrompt";

const baseProps = {
  isOpen: true,
  memberName: "Alice",
  itemCount: 3,
  destinations: [
    { id: "m-1", name: "Bob" },
    { id: "m-2", name: "Carol" },
  ],
  onConfirm: () => {},
  onCancel: () => {},
};

describe("MemberReassignmentPrompt", () => {
  it("shows the member name and pluralised item count", () => {
    render(<MemberReassignmentPrompt {...baseProps} />);
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText(/3 assigned items/)).toBeTruthy();
  });

  it("uses the singular form for a single item", () => {
    render(<MemberReassignmentPrompt {...baseProps} itemCount={1} />);
    expect(screen.getByText(/1 assigned item/)).toBeTruthy();
    expect(screen.queryByText(/1 assigned items/)).toBeNull();
  });

  it("disables the confirm action until a destination is chosen", () => {
    render(<MemberReassignmentPrompt {...baseProps} />);
    const confirm = screen.getByRole("button", { name: /Reassign & delete/i }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });

  it("calls onCancel from the cancel button", () => {
    const onCancel = mock(() => {});
    render(<MemberReassignmentPrompt {...baseProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    render(<MemberReassignmentPrompt {...baseProps} isOpen={false} />);
    expect(screen.queryByText("Reassign items")).toBeNull();
  });
});
