import { describe, it, expect } from "bun:test";
import { render } from "@testing-library/react";
import GhostAddButton from "./GhostAddButton";

describe("GhostAddButton", () => {
  it("uses border-foreground/20 (not border-foreground/10)", () => {
    const { getByRole } = render(<GhostAddButton onClick={() => {}} />);
    const btn = getByRole("button");
    expect(btn.className).toContain("border-foreground/20");
  });
});
