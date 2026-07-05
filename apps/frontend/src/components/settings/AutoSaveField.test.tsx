import { describe, it, expect } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { AutoSaveField } from "./AutoSaveField";

describe("AutoSaveField", () => {
  it("renders label and children", () => {
    renderWithProviders(
      <AutoSaveField label="Name" status="idle" errorMessage={null}>
        <input aria-label="name-input" />
      </AutoSaveField>
    );
    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByLabelText("name-input")).toBeTruthy();
  });

  it("shows saved flash when status is saved", () => {
    renderWithProviders(
      <AutoSaveField label="Name" status="saved" errorMessage={null}>
        <input aria-label="Name" />
      </AutoSaveField>
    );
    expect(screen.getByText(/saved/i)).toBeTruthy();
  });

  it("shows inline error text when status is error", () => {
    renderWithProviders(
      <AutoSaveField label="Name" status="error" errorMessage="Couldn't save — try again">
        <input aria-label="Name" />
      </AutoSaveField>
    );
    const err = screen.getByRole("alert");
    expect(err.textContent).toBe("Couldn't save — try again");
  });

  it("applies data-status attribute for pulse styling", () => {
    const { container } = renderWithProviders(
      <AutoSaveField label="Name" status="saved" errorMessage={null}>
        <input aria-label="Name" />
      </AutoSaveField>
    );
    const wrap = container.querySelector('[data-status="saved"]');
    expect(wrap).toBeTruthy();
  });
});
