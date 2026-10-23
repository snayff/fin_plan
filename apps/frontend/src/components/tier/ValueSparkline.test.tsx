import { describe, it, expect } from "bun:test";
import { render } from "@testing-library/react";
import ValueSparkline from "./ValueSparkline";
import { buildChartData } from "./buildValueChartData";

describe("ValueSparkline", () => {
  it("renders the Amount history label with multiple periods", () => {
    const periods = [
      { id: "p1", startDate: new Date("2020-01-01"), endDate: new Date("2023-01-01"), amount: 7 },
      { id: "p2", startDate: new Date("2023-01-01"), endDate: null, amount: 9 },
    ];

    const { getByText } = render(
      <ValueSparkline periods={periods} color="text-tier-committed" now={new Date("2026-04-04")} />
    );

    expect(getByText("Amount history")).toBeTruthy();
  });

  it("renders with a single period", () => {
    const periods = [{ id: "p1", startDate: new Date("2020-01-01"), endDate: null, amount: 7 }];

    const { getByText } = render(
      <ValueSparkline periods={periods} color="text-tier-committed" now={new Date("2026-04-04")} />
    );

    expect(getByText("Amount history")).toBeTruthy();
  });

  it("does not extend to now when the last period is scheduled in the future", () => {
    // Current period ends where a scheduled future period begins (typical
    // backend shape after adding a future-dated period).
    const periods = [
      { id: "p1", startDate: new Date("2026-04-20"), endDate: new Date("2026-05-01"), amount: 120 },
      { id: "p2", startDate: new Date("2026-05-01"), endDate: null, amount: 140 },
    ];

    const data = buildChartData(periods, new Date("2026-04-20"));

    // Must stop at the scheduled period's startDate — no spurious trailing point
    // dated `now` (which would be before p2's startDate).
    expect(data).toEqual([
      { date: "2026-04-20", value: 120 },
      { date: "2026-05-01", value: 120 },
      { date: "2026-05-01", value: 140 },
    ]);

    // Dates must be monotonically non-decreasing — the bug produced a tail point
    // earlier than its predecessors.
    for (let i = 1; i < data.length; i++) {
      expect(data[i]!.date >= data[i - 1]!.date).toBe(true);
    }
  });

  it("still extends the last period to now when it is already active", () => {
    const periods = [{ id: "p1", startDate: new Date("2026-01-01"), endDate: null, amount: 100 }];

    const data = buildChartData(periods, new Date("2026-04-20"));

    expect(data).toEqual([
      { date: "2026-01-01", value: 100 },
      { date: "2026-04-20", value: 100 },
    ]);
  });
});
