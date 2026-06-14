import { describe, it, expect, mock } from "bun:test";
import { render, screen } from "@testing-library/react";
import { UpcomingModePanel } from "./UpcomingModePanel";

mock.module("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: { showPence: false } }),
}));

mock.module("@/hooks/useGifts", () => ({
  useGiftsUpcoming: () => ({
    isLoading: false,
    data: {
      callouts: {
        thisMonth: { count: 0, total: 0 },
        nextThreeMonths: { count: 0, total: 0 },
        restOfYear: { count: 0, total: 0 },
        dateless: { count: 0, total: 0 },
      },
      groups: [],
    },
  }),
}));

mock.module("@/components/ui/GhostedListEmpty", () => ({
  GhostedListEmpty: (props: any) => (
    <div data-testid="ghosted-list-empty">
      <span>{props.ctaHeading}</span>
      <span>{props.ctaText}</span>
      <button onClick={props.onCtaClick}>{props.ctaButtonLabel}</button>
    </div>
  ),
}));

describe("UpcomingModePanel — empty state", () => {
  it("renders CTA when there are no upcoming events", () => {
    render(<UpcomingModePanel year={2026} />);
    expect(screen.getByTestId("ghosted-list-empty")).toBeInTheDocument();
    expect(screen.getByText("No upcoming gifts")).toBeInTheDocument();
    expect(screen.getByText("Plan gifts for your people to see them here.")).toBeInTheDocument();
    expect(screen.getByText("Go to Gifts")).toBeInTheDocument();
  });

  it("calls onNavigateToGifts when CTA button is clicked", () => {
    const onNavigate = mock(() => {});
    render(<UpcomingModePanel year={2026} onNavigateToGifts={onNavigate} />);
    screen.getByText("Go to Gifts").click();
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
