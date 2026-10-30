import { describe, it, expect, mock, beforeEach } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers/render";

const changePassword = mock(() => Promise.resolve({ message: "ok" }));
const logout = mock(() => Promise.resolve());

function useAuthStoreMock(selector: (state: unknown) => unknown) {
  return selector({
    accessToken: "test-token",
    logout,
  });
}
useAuthStoreMock.setState = () => {};

mock.module("@/stores/authStore", () => ({ useAuthStore: useAuthStoreMock }));
mock.module("@/services/auth.service", () => ({
  authService: { changePassword },
}));

import { ChangePasswordSection } from "./ChangePasswordSection";

beforeEach(() => {
  changePassword.mockClear();
  changePassword.mockResolvedValue({ message: "ok" });
  logout.mockClear();
});

const NEW_PASSWORD = "a-brand-new-password";

describe("ChangePasswordSection", () => {
  it("renders current, new, and confirm password fields", () => {
    renderWithProviders(<ChangePasswordSection />);
    expect(screen.getByLabelText(/current password/i)).toBeTruthy();
    expect(screen.getByLabelText(/^new password$/i)).toBeTruthy();
    expect(screen.getByLabelText(/confirm new password/i)).toBeTruthy();
  });

  it("blocks submission and shows an error when the new passwords do not match", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChangePasswordSection />);

    await user.type(screen.getByLabelText(/current password/i), "current-password-123");
    await user.type(screen.getByLabelText(/^new password$/i), NEW_PASSWORD);
    await user.type(screen.getByLabelText(/confirm new password/i), "different-password-xyz");
    await user.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeTruthy();
    });
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("blocks submission when the new password is shorter than 12 characters", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChangePasswordSection />);

    await user.type(screen.getByLabelText(/current password/i), "current-password-123");
    await user.type(screen.getByLabelText(/^new password$/i), "short");
    await user.type(screen.getByLabelText(/confirm new password/i), "short");
    await user.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => {
      expect(screen.getByText(/at least 12 characters/i)).toBeTruthy();
    });
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("calls authService.changePassword with the current token and payload", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChangePasswordSection />);

    await user.type(screen.getByLabelText(/current password/i), "current-password-123");
    await user.type(screen.getByLabelText(/^new password$/i), NEW_PASSWORD);
    await user.type(screen.getByLabelText(/confirm new password/i), NEW_PASSWORD);
    await user.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith("test-token", {
        currentPassword: "current-password-123",
        newPassword: NEW_PASSWORD,
      });
    });
  });

  it("shows a confirmation and clears the fields after a successful change", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ChangePasswordSection />);

    await user.type(screen.getByLabelText(/current password/i), "current-password-123");
    await user.type(screen.getByLabelText(/^new password$/i), NEW_PASSWORD);
    await user.type(screen.getByLabelText(/confirm new password/i), NEW_PASSWORD);
    await user.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => {
      expect(screen.getByText(/password changed/i)).toBeTruthy();
    });
    expect((screen.getByLabelText(/current password/i) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/^new password$/i) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/confirm new password/i) as HTMLInputElement).value).toBe("");
  });
});
