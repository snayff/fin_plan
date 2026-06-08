import { describe, it, expect } from "bun:test";
import { render } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { expectNoA11yViolations } from "@/test/helpers/axe";
import GhostAddButton from "./GhostAddButton";

describe("GhostAddButton", () => {
  it("uses border-foreground/20 (not border-foreground/10)", () => {
    const { getByRole } = render(<GhostAddButton onClick={() => {}} />);
    const btn = getByRole("button");
    expect(btn.className).toContain("border-foreground/20");
  });

  it("has no serious or critical a11y violations", async () => {
    const { container } = renderWithProviders(<GhostAddButton onClick={() => {}} />);
    await expectNoA11yViolations(container);
  });
});
