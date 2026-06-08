import { describe, it, expect, mock, afterEach } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { expectNoA11yViolations } from "@/test/helpers/axe";
import { PageHeader } from "./PageHeader";

mock.module("@/hooks/useAnimatedValue", () => ({
  useAnimatedValue: (target: number) => target,
}));

describe("PageHeader", () => {
  it("renders title in uppercase", () => {
    renderWithProviders(<PageHeader title="Income" />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("Income");
    expect(heading.className).toContain("uppercase");
  });

  it("applies default page-accent colour when no colorClass given", () => {
    renderWithProviders(<PageHeader title="Overview" />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.className).toContain("text-page-accent");
  });

  it("applies custom colour class", () => {
    renderWithProviders(<PageHeader title="Income" colorClass="text-tier-income" />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.className).toContain("text-tier-income");
    expect(heading.className).not.toContain("text-page-accent");
  });

  it("renders total when provided", () => {
    renderWithProviders(
      <PageHeader title="Income" total={3500} totalColorClass="text-tier-income" />
    );
    expect(screen.getByText("£3,500")).toBeTruthy();
  });

  it("omits total when not provided", () => {
    renderWithProviders(<PageHeader title="Overview" />);
    expect(screen.queryByText(/£/)).toBeNull();
  });

  it("omits total when null", () => {
    renderWithProviders(<PageHeader title="Income" total={null} />);
    expect(screen.queryByText(/£/)).toBeNull();
  });

  it("has correct typography classes", () => {
    renderWithProviders(<PageHeader title="Test" />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.className).toContain("font-heading");
    expect(heading.className).toContain("font-bold");
    expect(heading.className).toContain("tracking-tier");
    expect(heading.className).toContain("text-lg");
  });

  it("renders context name and separator inside heading when contextName is provided", () => {
    renderWithProviders(<PageHeader title="Household" contextName="Snaith" />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toContain("Household");
    expect(heading.textContent).toContain("/");
    expect(heading.textContent).toContain("Snaith");
  });

  it("does not render separator when contextName is omitted", () => {
    renderWithProviders(<PageHeader title="Household" />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).not.toContain("/");
  });

  it("has no serious or critical a11y violations", async () => {
    const { container } = renderWithProviders(<PageHeader title="Income" />);
    await expectNoA11yViolations(container);
  });

  describe("mobile back button (onBack slot)", () => {
    const originalMatchMedia = window.matchMedia;
    type MqlListener = (e: MediaQueryListEvent) => void;
    function setViewport(mobile: boolean) {
      const listeners = new Set<MqlListener>();
      window.matchMedia = (query: string): MediaQueryList =>
        ({
          matches: mobile,
          media: query,
          onchange: null,
          addEventListener: (e: string, l: MqlListener) => {
            if (e === "change") listeners.add(l);
          },
          removeEventListener: (e: string, l: MqlListener) => {
            if (e === "change") listeners.delete(l);
          },
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList;
    }
    afterEach(() => {
      window.matchMedia = originalMatchMedia;
    });

    it("renders back button on mobile when onBack is provided", () => {
      setViewport(true);
      const onBack = mock(() => {});
      renderWithProviders(<PageHeader title="Income" onBack={onBack} />);
      expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
    });

    it("does NOT render back button on desktop even when onBack is provided", () => {
      setViewport(false);
      const onBack = mock(() => {});
      renderWithProviders(<PageHeader title="Income" onBack={onBack} />);
      expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();
    });

    it("does NOT render back button on mobile when onBack is omitted", () => {
      setViewport(true);
      renderWithProviders(<PageHeader title="Income" />);
      expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();
    });
  });
});
