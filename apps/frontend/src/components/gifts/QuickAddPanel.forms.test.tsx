import { describe, it, expect, mock } from "bun:test";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";

const createPersonMock = mock(() => {});
const createEventMock = mock(() => {});
const setBudgetMock = mock(() => {});

// A matrix with people + events so the add-forms and budget strip all render.
mock.module("@/hooks/useGifts", () => ({
  useQuickAddMatrix: () => ({
    isLoading: false,
    data: {
      people: [{ id: "p1", name: "Mum", memberId: null }],
      events: [{ id: "e1", name: "Christmas" }],
      allocations: [],
      budget: { annual: 2400, currentPlanned: 0 },
    },
  }),
  useBulkUpsertAllocations: () => ({ mutate: mock(() => {}), isPending: false }),
  useSetGiftBudget: () => ({ mutate: setBudgetMock, isPending: false }),
  useCreateGiftPerson: () => ({ mutate: createPersonMock, isPending: false }),
  useCreateGiftEvent: () => ({ mutate: createEventMock, isPending: false }),
}));

import { QuickAddPanel } from "./QuickAddPanel";

describe("QuickAddPanel — add person", () => {
  it("reveals the person form from the ghost button and saves a new person", () => {
    renderWithProviders(<QuickAddPanel year={2026} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add person" }));
    const input = screen.getByPlaceholderText("e.g. Mum, Best friend");
    fireEvent.change(input, { target: { value: "Granny" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(createPersonMock).toHaveBeenCalledWith({ name: "Granny" });
  });

  it("rejects a duplicate person name with an inline error", () => {
    createPersonMock.mockClear();
    renderWithProviders(<QuickAddPanel year={2026} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add person" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Mum, Best friend"), {
      target: { value: "mum" },
    });
    // The inline form's Save is the first "Save" in the DOM (the bottom actions
    // row also has one).
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]!);
    expect(screen.getByText(/already exists/)).toBeInTheDocument();
    expect(createPersonMock).not.toHaveBeenCalled();
  });

  it("disables Save until a name is entered and closes on Escape", () => {
    renderWithProviders(<QuickAddPanel year={2026} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add person" }));
    expect(screen.getAllByRole("button", { name: "Save" })[0]!).toBeDisabled();
    fireEvent.keyDown(screen.getByPlaceholderText("e.g. Mum, Best friend"), { key: "Escape" });
    expect(screen.queryByPlaceholderText("e.g. Mum, Best friend")).toBeNull();
  });
});

describe("QuickAddPanel — add event", () => {
  it("reveals the event form and saves a personal-date event", () => {
    createEventMock.mockClear();
    renderWithProviders(<QuickAddPanel year={2026} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add event" }));
    fireEvent.change(screen.getByLabelText("Event name"), { target: { value: "Anniversary" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]!);
    expect(createEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Anniversary", dateType: "personal" })
    );
  });

  it("cancels the event form without saving", () => {
    createEventMock.mockClear();
    renderWithProviders(<QuickAddPanel year={2026} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add event" }));
    // Inline form Cancel is the first "Cancel" in the DOM.
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]!);
    expect(screen.queryByLabelText("Event name")).toBeNull();
    expect(createEventMock).not.toHaveBeenCalled();
  });
});

describe("QuickAddPanel — budget & discard", () => {
  it("persists an edited budget on blur", () => {
    setBudgetMock.mockClear();
    renderWithProviders(<QuickAddPanel year={2026} readOnly={false} />);
    const budgetInput = screen.getByDisplayValue("2400");
    fireEvent.change(budgetInput, { target: { value: "3000" } });
    fireEvent.blur(budgetInput);
    expect(setBudgetMock).toHaveBeenCalledWith({ year: 2026, data: { annualBudget: 3000 } });
  });

  it("opens the discard dialog when cancelling with unsaved changes", async () => {
    renderWithProviders(<QuickAddPanel year={2026} readOnly={false} />);
    const cell = screen.getByTestId("cell-p1-e1") as HTMLInputElement;
    fireEvent.change(cell, { target: { value: "75" } });
    // The bottom Cancel button (last in DOM) triggers the discard guard
    const cancels = screen.getAllByRole("button", { name: "Cancel" });
    fireEvent.click(cancels[cancels.length - 1]!);
    expect(await screen.findByText("Discard changes?")).toBeInTheDocument();
  });

  it("hides the add buttons and disables cells in read-only mode", () => {
    renderWithProviders(<QuickAddPanel year={2026} readOnly={true} />);
    expect(screen.queryByRole("button", { name: "+ Add person" })).toBeNull();
    expect((screen.getByTestId("cell-p1-e1") as HTMLInputElement).disabled).toBe(true);
  });
});
