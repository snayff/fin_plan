import { describe, it, expect } from "bun:test";
import { renderWithProviders } from "@/test/helpers/render";
import { screen } from "@testing-library/react";
import GoalsPage from "./GoalsPage";

describe("GoalsPage", () => {
  it("renders the planned-feature state", () => {
    renderWithProviders(<GoalsPage />, { initialEntries: ["/goals"] });
    expect(screen.getByTestId("goals-page")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /goals/i })).toBeTruthy();
    // Honest "planned" messaging rather than a terse dead end.
    expect(screen.getByText(/^planned$/i)).toBeTruthy();
    expect(screen.getByText(/goals are on the way/i)).toBeTruthy();
  });

  it("describes what Goals will do", () => {
    renderWithProviders(<GoalsPage />, { initialEntries: ["/goals"] });
    expect(screen.getByText(/set targets/i)).toBeTruthy();
    expect(screen.getByText(/fund from surplus/i)).toBeTruthy();
    expect(screen.getByText(/track progress/i)).toBeTruthy();
  });
});
