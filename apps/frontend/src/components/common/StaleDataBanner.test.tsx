import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { StaleDataBanner } from "./StaleDataBanner";

describe("StaleDataBanner", () => {
  it("shows sync failure message (not 'Data may be outdated')", () => {
    render(<StaleDataBanner erroredAt={new Date(Date.now() - 60000)} onRetry={() => {}} />);
    expect(screen.queryByText(/data may be outdated/i)).toBeNull();
    expect(screen.getByText(/couldn't sync/i)).toBeTruthy();
  });

  it("shows 'Retry' button", () => {
    render(<StaleDataBanner erroredAt={null} onRetry={() => {}} />);
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  });
});
