import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { ForecastSectionNavigator, type ForecastSection } from "./ForecastSectionNavigator";

describe("ForecastSectionNavigator", () => {
  it("renders Cashflow and Growth entries inside a labelled nav", () => {
    render(<ForecastSectionNavigator selected="cashflow" onSelect={() => {}} />);
    expect(screen.getByRole("navigation", { name: /forecast sections/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /cashflow/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /growth/i })).toBeTruthy();
  });

  it("marks the selected entry with aria-current", () => {
    render(<ForecastSectionNavigator selected="growth" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /growth/i }).getAttribute("aria-current")).toBe(
      "true"
    );
    expect(
      screen.getByRole("button", { name: /cashflow/i }).getAttribute("aria-current")
    ).toBeNull();
  });

  it("calls onSelect when an entry is clicked", () => {
    const handler = mock((section: ForecastSection) => section);
    render(<ForecastSectionNavigator selected="cashflow" onSelect={handler} />);
    fireEvent.click(screen.getByRole("button", { name: /growth/i }));
    expect(handler).toHaveBeenCalledWith("growth");
  });
});
