import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { SurplusStrip } from "./SurplusStrip";

describe("SurplusStrip", () => {
  it("renders amount and percent in tier-surplus colour", () => {
    render(<SurplusStrip income={10000} committed={4000} discretionary={2000} showPence={false} />);
    expect(screen.getByText(/SURPLUS/i)).toBeInTheDocument();
    expect(screen.getByText(/£4,000/)).toBeInTheDocument();
    expect(screen.getByText(/40\.0%/)).toBeInTheDocument();
  });

  it("shows pence when showPence is true (#122)", () => {
    render(
      <SurplusStrip income={1000.5} committed={250.25} discretionary={100} showPence={true} />
    );
    // surplus = 1000.50 - 250.25 - 100 = 650.25
    expect(screen.getByText(/£650\.25/)).toBeInTheDocument();
  });

  it("shows dash when income is zero (no divide-by-zero)", () => {
    render(<SurplusStrip income={0} committed={0} discretionary={0} showPence={false} />);
    expect(screen.getByText(/£0/)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("never applies a red/negative colour when surplus is negative", () => {
    const { container } = render(
      <SurplusStrip income={1000} committed={2000} discretionary={500} showPence={false} />
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("text-tier-surplus");
    expect(root.className).not.toContain("text-error");
  });
});
