import { describe, it, expect, mock } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
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
});
