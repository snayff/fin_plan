import { describe, it, expect, mock, beforeEach } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/helpers/render";

const forgotPassword = mock(() => Promise.resolve({ message: "generic" }));
mock.module("../../services/auth.service", () => ({
  authService: { forgotPassword },
}));

import ForgotPasswordPage from "./ForgotPasswordPage";

beforeEach(() => {
  forgotPassword.mockClear();
  forgotPassword.mockResolvedValue({ message: "generic" });
});

describe("ForgotPasswordPage", () => {
  it("renders an email field and submit button", () => {
    renderWithProviders(<ForgotPasswordPage />);
    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /send reset link/i })).toBeTruthy();
  });

  it("links back to sign in", () => {
    renderWithProviders(<ForgotPasswordPage />);
    expect(screen.getByRole("link", { name: /back to sign in/i }).getAttribute("href")).toBe(
      "/login"
    );
  });

  it("calls forgotPassword with the email on submit", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText(/email/i), "user@test.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(forgotPassword).toHaveBeenCalledWith("user@test.com");
    });
  });

  it("shows the generic confirmation after a successful request", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText(/email/i), "user@test.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/if an account exists for that email/i)).toBeTruthy();
    });
  });

  it("shows the SAME confirmation even when the account does not exist (no enumeration)", async () => {
    const user = userEvent.setup();
    // Backend returns the same generic 200 for unknown emails — the page must
    // never branch on account existence.
    renderWithProviders(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText(/email/i), "nobody@test.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/if an account exists for that email/i)).toBeTruthy();
    });
  });
});
