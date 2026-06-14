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
        thisMonth: { count: 1, total: 100 },
        nextThreeMonths: { count: 2, total: 250 },
        restOfYear: { count: 0, total: 0 },
        dateless: { count: 1, total: 50 },
      },
      groups: [
        {
          month: 4,
          rows: [
            {
              eventId: "e1",
              eventName: "Mum's Birthday",
              eventDateType: "personal",
              day: 12,
              recipients: [{ personId: "p1", personName: "Mum", planned: 50, spent: null }],
              plannedTotal: 50,
              spentTotal: null,
            },
          ],
        },
        {
          month: 12,
          rows: [
            {
              eventId: "e2",
              eventName: "Christmas",
              eventDateType: "shared",
              day: 25,
              recipients: [
                { personId: "p1", personName: "Mum", planned: 50, spent: null },
                { personId: "p2", personName: "Dad", planned: 50, spent: null },
              ],
              plannedTotal: 100,
              spentTotal: null,
            },
          ],
        },
        { month: 0, rows: [] },
      ],
    },
  }),
}));

describe("UpcomingModePanel", () => {
  it("renders the four callout cards", () => {
    render(<UpcomingModePanel year={2026} />);
    expect(screen.getByTestId("callout-thisMonth")).toHaveTextContent("£100");
    expect(screen.getByTestId("callout-nextThreeMonths")).toHaveTextContent("£250");
    expect(screen.getByTestId("callout-restOfYear")).toHaveTextContent("£0");
    expect(screen.getByTestId("callout-dateless")).toHaveTextContent("£50");
  });

  it("renders shared event with inline recipients", () => {
    render(<UpcomingModePanel year={2026} />);
    expect(screen.getByText(/Christmas/)).toBeInTheDocument();
    expect(screen.getByText("Mum, Dad")).toBeInTheDocument();
  });
});
