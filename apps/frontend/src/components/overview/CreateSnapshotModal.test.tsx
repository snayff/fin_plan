import { describe, it, expect, mock, beforeEach } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";

let mutateImpl: (name: string, opts: any) => void = () => {};
let pending = false;

mock.module("@/hooks/useSettings", () => ({
  useCreateSnapshot: () => ({
    mutate: (name: string, opts: any) => mutateImpl(name, opts),
    isPending: pending,
  }),
}));

import { CreateSnapshotModal } from "./CreateSnapshotModal";

beforeEach(() => {
  mutateImpl = () => {};
  pending = false;
});

describe("CreateSnapshotModal", () => {
  it("submits the entered name and reports success", () => {
    const onClose = mock(() => {});
    const onCreated = mock(() => {});
    mutateImpl = (_name, opts) => opts.onSuccess({ id: "snap-1" });

    render(<CreateSnapshotModal onClose={onClose} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "March 2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onCreated).toHaveBeenCalledWith("snap-1");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("surfaces a duplicate-name error on a 409 response", () => {
    mutateImpl = (_name, opts) => opts.onError({ status: 409 });

    render(<CreateSnapshotModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      screen.getByText("A snapshot with this name already exists — choose a different name.")
    ).toBeTruthy();
  });

  it("closes via the cancel button", () => {
    const onClose = mock(() => {});
    render(<CreateSnapshotModal onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a saving state when the mutation is pending", () => {
    pending = true;
    render(<CreateSnapshotModal onClose={() => {}} />);
    const saveBtn = screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });
});
