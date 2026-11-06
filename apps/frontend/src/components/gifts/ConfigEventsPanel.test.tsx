import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ConfigEventsPanel } from "./ConfigEventsPanel";

// The panel reads ?focus= for search deep links, so it needs a router.
const router = { wrapper: MemoryRouter };

const createMock = mock(() => Promise.resolve({}));
const deleteMock = mock(() => Promise.resolve());

mock.module("@/hooks/useGifts", () => ({
  useConfigEvents: () => ({
    isLoading: false,
    data: [
      {
        id: "e1",
        name: "Christmas",
        dateType: "shared",
        isLocked: true,
        dateMonth: 12,
        dateDay: 25,
      },
      {
        id: "e2",
        name: "Wedding",
        dateType: "personal",
        isLocked: false,
        dateMonth: null,
        dateDay: null,
      },
    ],
  }),
  useCreateGiftEvent: () => ({ mutate: createMock, isPending: false }),
  useDeleteGiftEvent: () => ({ mutate: deleteMock, isPending: false }),
}));

describe("ConfigEventsPanel", () => {
  it("groups locked and custom events", () => {
    render(<ConfigEventsPanel readOnly={false} />, router);
    expect(screen.getByText(/locked/i)).toBeInTheDocument();
    expect(screen.getByText(/custom/i)).toBeInTheDocument();
  });

  it("locked event is not deletable", () => {
    render(<ConfigEventsPanel readOnly={false} />, router);
    const xmasRow = screen.getByTestId("event-row-e1");
    expect(xmasRow.querySelector("button")).toBeNull();
  });

  it("shows add form when + Add event is clicked", () => {
    render(<ConfigEventsPanel readOnly={false} />, router);
    expect(screen.queryByLabelText(/event name/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add event/i }));
    expect(screen.getByLabelText(/event name/i)).toBeInTheDocument();
  });

  it("create form submits with correct data for shared-date events", () => {
    render(<ConfigEventsPanel readOnly={false} />, router);
    // Open the form
    fireEvent.click(screen.getByRole("button", { name: /add event/i }));

    // Fill in the name
    fireEvent.change(screen.getByLabelText(/event name/i), {
      target: { value: "Halloween" },
    });

    // Change date type to shared via the Select trigger
    fireEvent.click(screen.getByLabelText(/date type/i));
    fireEvent.click(screen.getByText(/same date every year/i));

    // Select month
    fireEvent.click(screen.getByLabelText(/month/i));
    fireEvent.click(screen.getByText("October"));

    // Select day
    fireEvent.click(screen.getByLabelText(/day/i));
    fireEvent.click(screen.getByText("31"));

    // Submit
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Halloween",
        dateType: "shared",
        dateMonth: 10,
        dateDay: 31,
      })
    );
  });
});
