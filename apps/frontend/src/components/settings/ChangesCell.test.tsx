import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { ChangesCell } from "./ChangesCell";

describe("ChangesCell", () => {
  it("renders an em-dash when there are no changes", () => {
    const { container } = render(<ChangesCell changes={null} action="UPDATE_ITEM" />);
    expect(container.textContent).toContain("—");
  });

  it("renders an em-dash for an empty changes array", () => {
    const { container } = render(<ChangesCell changes={[]} action="UPDATE_ITEM" />);
    expect(container.textContent).toContain("—");
  });

  it("shows only the after value for CREATE_ actions and humanizes the field", () => {
    render(
      <ChangesCell changes={[{ field: "displayName", after: "Rent" }]} action="CREATE_ITEM" />
    );
    expect(screen.getByText("display Name")).toBeTruthy();
    expect(screen.getByText("Rent")).toBeTruthy();
  });

  it("shows the struck-through before value for DELETE_ actions", () => {
    render(<ChangesCell changes={[{ field: "name", before: "Old" }]} action="DELETE_ITEM" />);
    expect(screen.getByText("Old")).toBeTruthy();
  });

  it("shows before → after for update actions", () => {
    render(
      <ChangesCell changes={[{ field: "amount", before: 10, after: 20 }]} action="UPDATE_ITEM" />
    );
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByText("20")).toBeTruthy();
    expect(screen.getByText("→")).toBeTruthy();
  });

  it("renders booleans as Yes/No", () => {
    render(
      <ChangesCell
        changes={[{ field: "active", before: false, after: true }]}
        action="UPDATE_ITEM"
      />
    );
    expect(screen.getByText("No")).toBeTruthy();
    expect(screen.getByText("Yes")).toBeTruthy();
  });

  it("renders empty values as an italicised placeholder", () => {
    render(<ChangesCell changes={[{ field: "notes", after: "" }]} action="CREATE_ITEM" />);
    expect(screen.getByText("(empty)")).toBeTruthy();
  });

  it("formats ISO datetime strings into a friendly date", () => {
    render(
      <ChangesCell
        changes={[{ field: "dueDate", after: "2026-03-15T00:00:00.000Z" }]}
        action="CREATE_ITEM"
      />
    );
    expect(screen.getByText("15 Mar 2026")).toBeTruthy();
  });
});
