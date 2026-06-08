import { describe, it, expect, mock, beforeEach } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";

const mutate = mock((_args: { year: number; data: { annualBudget: number } }) => {});

mock.module("@/hooks/useGifts", () => ({
  useSetGiftBudget: () => ({ mutate, isPending: false }),
}));

import { ConfigBudgetPanel } from "./ConfigBudgetPanel";

beforeEach(() => {
  mutate.mockClear();
});

describe("ConfigBudgetPanel", () => {
  it("disables save until the value changes", () => {
    render(<ConfigBudgetPanel year={2026} readOnly={false} currentBudget={500} />);
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it("saves the parsed budget when changed", () => {
    render(<ConfigBudgetPanel year={2026} readOnly={false} currentBudget={500} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "750" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mutate).toHaveBeenCalledWith({ year: 2026, data: { annualBudget: 750 } });
  });

  it("saves on Enter keypress", () => {
    render(<ConfigBudgetPanel year={2026} readOnly={false} currentBudget={500} />);
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "900" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mutate).toHaveBeenCalledWith({ year: 2026, data: { annualBudget: 900 } });
  });

  it("disables the input in read-only mode", () => {
    render(<ConfigBudgetPanel year={2026} readOnly currentBudget={500} />);
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});
