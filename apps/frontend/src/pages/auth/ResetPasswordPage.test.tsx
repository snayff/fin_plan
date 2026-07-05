import { describe, it, expect, mock, beforeEach } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/helpers/render";

const resetPassword = mock(() => Promise.resolve({ message: "ok" }));
mock.module("../../services/auth.service", () => ({
  authService: { resetPassword },
}));

import ResetPasswordPage from "./ResetPasswordPage";

beforeEach(() => {
  resetPassword.mockClear();
  resetPassword.mockResolvedValue({ message: "ok" });
});

function renderWithToken(token = "valid-token") {
  return renderWithProviders(<ResetPasswordPage />, {
    initialEntries: [`/reset-password?token=${token}`],
  });
}

describe("ResetPasswordPage", () => {
  it("renders new password and confirm fields", () => {
    renderWithToken();
    expect(screen.getByLabelText(/^new password$/i)).toBeTruthy();
    expect(screen.getByLabelText(/confirm new password/i)).toBeTruthy();
  });

  it("calls resetPassword with the token from the URL and the new password", async () => {
    const user = userEvent.setup();
    renderWithToken("token-abc");

    await user.type(screen.getByLabelText(/^new password$/i), "brand-new-password-1");
    await user.type(screen.getByLabelText(/confirm new password/i), "brand-new-password-1");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(resetPassword).toHaveBeenCalledWith({
        token: "token-abc",
        newPassword: "brand-new-password-1",
      });
    });
  });

  it("shows a success message and sign-in link after a successful reset", async () => {
    const user = userEvent.setup();
    renderWithToken();

    await user.type(screen.getByLabelText(/^new password$/i), "brand-new-password-1");
    await user.type(screen.getByLabelText(/confirm new password/i), "brand-new-password-1");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/your password has been reset/i)).toBeTruthy();
    });
    expect(screen.getByRole("link", { name: /go to sign in/i }).getAttribute("href")).toBe(
      "/login"
    );
  });

  it("blocks submission and shows an error when passwords do not match", async () => {
    const user = userEvent.setup();
    renderWithToken();

    await user.type(screen.getByLabelText(/^new password$/i), "brand-new-password-1");
    await user.type(screen.getByLabelText(/confirm new password/i), "different-password-1");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeTruthy();
    });
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("shows a generic error when the reset request fails", async () => {
    const user = userEvent.setup();
    resetPassword.mockRejectedValue({ message: "This reset link is invalid or has expired" });
    renderWithToken();

    await user.type(screen.getByLabelText(/^new password$/i), "brand-new-password-1");
    await user.type(screen.getByLabelText(/confirm new password/i), "brand-new-password-1");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid or has expired/i)).toBeTruthy();
    });
  });

  it("shows an error when the token is missing from the URL", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ResetPasswordPage />, { initialEntries: ["/reset-password"] });

    await user.type(screen.getByLabelText(/^new password$/i), "brand-new-password-1");
    await user.type(screen.getByLabelText(/confirm new password/i), "brand-new-password-1");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid or has expired/i)).toBeTruthy();
    });
    expect(resetPassword).not.toHaveBeenCalled();
  });
});
