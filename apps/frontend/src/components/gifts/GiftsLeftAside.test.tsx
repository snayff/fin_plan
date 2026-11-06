// apps/frontend/src/components/gifts/GiftsLeftAside.test.tsx
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";

mock.module("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: { showPence: false } }),
}));

import { GiftsLeftAside } from "./GiftsLeftAside";

const sampleBudget = {
  annualBudget: 1000,
  planned: 500,
  spent: 100,
  plannedOverBudgetBy: 0,
  spentOverBudgetBy: 0,
};

describe("GiftsLeftAside", () => {
  it("renders title and three mode tabs", () => {
    render(
      <GiftsLeftAside mode="gifts" onModeChange={() => {}} budget={sampleBudget} readOnly={false} />
    );
    expect(screen.getByRole("heading", { name: /gifts/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^gifts$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upcoming/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /config/i })).toBeInTheDocument();
  });

  it("invokes onModeChange when a tab is clicked", () => {
    const onModeChange = mock(() => {});
    render(
      <GiftsLeftAside
        mode="gifts"
        onModeChange={onModeChange}
        budget={sampleBudget}
        readOnly={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /upcoming/i }));
    expect(onModeChange).toHaveBeenCalledWith("upcoming");
  });
});
