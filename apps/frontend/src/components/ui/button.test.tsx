import { describe, expect, it, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { Button } from "./button";
import { expectNoA11yViolations } from "@/test/helpers/axe";

describe("Button", () => {
  it("has no serious or critical a11y violations", async () => {
    const { container } = renderWithProviders(<Button>Save</Button>);
    await expectNoA11yViolations(container);
  });
});

describe("Button size variants (mobile a11y)", () => {
  test("default size hits 44px mobile (h-11) and 36px desktop (sm:h-9)", () => {
    render(<Button>click</Button>);
    const btn = screen.getByRole("button", { name: "click" });
    expect(btn.className).toContain("h-11");
    expect(btn.className).toContain("sm:h-9");
  });

  test("icon size hits 44px square mobile and 36px square desktop", () => {
    render(<Button size="icon" aria-label="action" />);
    const btn = screen.getByRole("button", { name: "action" });
    expect(btn.className).toContain("h-11");
    expect(btn.className).toContain("w-11");
    expect(btn.className).toContain("sm:h-9");
    expect(btn.className).toContain("sm:w-9");
  });

  test("lg size hits 48px mobile and 40px desktop", () => {
    render(<Button size="lg">submit</Button>);
    const btn = screen.getByRole("button", { name: "submit" });
    expect(btn.className).toContain("h-12");
    expect(btn.className).toContain("sm:h-10");
  });

  test("sm size deliberately stays smaller on mobile (36px) and 32px on desktop", () => {
    render(<Button size="sm">filter</Button>);
    const btn = screen.getByRole("button", { name: "filter" });
    expect(btn.className).toContain("h-9");
    expect(btn.className).toContain("sm:h-8");
  });
});
