import { describe, it, expect, mock, beforeEach } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GiftPersonDetail } from "./GiftPersonDetail";

const upsertMock = mock(() => Promise.resolve({}));
mock.module("@/hooks/useGifts", () => ({
  useGiftPerson: () => ({
    data: {
      person: {
        id: "p1",
        name: "Mum",
        notes: null,
        sortOrder: 0,
        isHouseholdMember: false,
        plannedCount: 1,
        boughtCount: 0,
        plannedTotal: 50,
        spentTotal: 0,
        hasOverspend: false,
      },
      allocations: [
        {
          id: "a1",
          giftPersonId: "p1",
          giftEventId: "e1",
          eventName: "Christmas",
          eventDateType: "shared",
          eventIsLocked: true,
          year: 2026,
          planned: 50,
          spent: null,
          status: "planned",
          notes: null,
          dateMonth: null,
          dateDay: null,
          resolvedMonth: 12,
          resolvedDay: 25,
        },
        {
          id: null,
          giftPersonId: "p1",
          giftEventId: "e2",
          eventName: "Birthday",
          eventDateType: "personal",
          eventIsLocked: true,
          year: 2026,
          planned: 0,
          spent: null,
          status: "planned",
          notes: null,
          dateMonth: null,
          dateDay: null,
          resolvedMonth: null,
          resolvedDay: null,
        },
      ],
    },
    isLoading: false,
  }),
  useUpsertAllocation: () => ({ mutate: upsertMock, isPending: false }),
}));

function wrapper({ children }: { children: any }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => upsertMock.mockClear());

describe("GiftPersonDetail", () => {
  it("renders breadcrumb and event cards", () => {
    render(<GiftPersonDetail personId="p1" year={2026} onBack={() => {}} readOnly={false} />, {
      wrapper,
    });
    expect(screen.getByText(/← People/i)).toBeInTheDocument();
    expect(screen.getByText("Mum")).toBeInTheDocument();
    expect(screen.getByText("Christmas")).toBeInTheDocument();
    expect(screen.getByText("Birthday")).toBeInTheDocument();
  });

  it("shows 'needs date' for personal-date event missing date", () => {
    render(<GiftPersonDetail personId="p1" year={2026} onBack={() => {}} readOnly={false} />, {
      wrapper,
    });
    expect(screen.getByText(/needs date/i)).toBeInTheDocument();
  });

  it("calls onBack when breadcrumb clicked", () => {
    const onBack = mock(() => {});
    render(<GiftPersonDetail personId="p1" year={2026} onBack={onBack} readOnly={false} />, {
      wrapper,
    });
    fireEvent.click(screen.getByTestId("gifts-breadcrumb-back"));
    expect(onBack).toHaveBeenCalled();
  });

  it("blurring spent input triggers upsertAllocation with bought transition", () => {
    render(<GiftPersonDetail personId="p1" year={2026} onBack={() => {}} readOnly={false} />, {
      wrapper,
    });
    const spentInput = screen.getByTestId("spent-input-a1") as HTMLInputElement;
    fireEvent.change(spentInput, { target: { value: "45" } });
    fireEvent.blur(spentInput);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: "p1",
        eventId: "e1",
        year: 2026,
        data: { spent: 45 },
      })
    );
  });

  it("offers day + month pickers only for personal-date events", () => {
    render(<GiftPersonDetail personId="p1" year={2026} onBack={() => {}} readOnly={false} />, {
      wrapper,
    });
    expect(screen.getByTestId("date-fields-e2")).toBeInTheDocument();
    expect(screen.queryByTestId("date-fields-a1")).toBeNull();
    expect(screen.getByLabelText("Birthday day")).toBeInTheDocument();
    expect(screen.getByLabelText("Birthday month")).toBeInTheDocument();
  });

  it("explains how to resolve a missing personal date", () => {
    render(<GiftPersonDetail personId="p1" year={2026} onBack={() => {}} readOnly={false} />, {
      wrapper,
    });
    expect(screen.getByText(/pick the day and month below/i)).toBeInTheDocument();
  });
});
