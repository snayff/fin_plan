import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { MobileUnsupportedNotice } from "./MobileUnsupportedNotice";

describe("MobileUnsupportedNotice", () => {
  test("renders the page name as a heading", () => {
    renderWithProviders(<MobileUnsupportedNotice pageName="Gifts" />);
    expect(screen.getByRole("heading", { name: "Gifts" })).toBeInTheDocument();
  });

  test("renders a default message referencing the page name", () => {
    renderWithProviders(<MobileUnsupportedNotice pageName="Household Settings" />);
    expect(screen.getByText(/best used on a larger screen/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Household Settings/).length).toBeGreaterThanOrEqual(1);
  });

  test("renders a custom message when provided", () => {
    renderWithProviders(
      <MobileUnsupportedNotice pageName="X" message="Bulk entry only on desktop." />
    );
    expect(screen.getByText("Bulk entry only on desktop.")).toBeInTheDocument();
  });

  test("exposes data attributes for invariant tests", () => {
    renderWithProviders(<MobileUnsupportedNotice pageName="Goals" />);
    const notice = screen.getByTestId("mobile-unsupported-notice");
    expect(notice.dataset.pageName).toBe("Goals");
  });

  test("renders a back button", () => {
    renderWithProviders(<MobileUnsupportedNotice pageName="Help" />);
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
  });
});
