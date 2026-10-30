import { useState, type FormEvent } from "react";
import { NEW_PASSWORD_MIN } from "@finplan/shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/authStore";
import { authService } from "@/services/auth.service";
import { SettingsSection } from "./SettingsSection";

/**
 * SEC-2-UI — Change-password control for the profile settings page. On success
 * the backend revokes every session, so we clear the form, confirm, and sign
 * the user out (routing back to /login on the next request).
 */
export function ChangePasswordSection() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const logout = useAuthStore((s) => s.logout);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");

  function resetFields() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < NEW_PASSWORD_MIN) {
      setError(`New password must be at least ${NEW_PASSWORD_MIN} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (!accessToken) {
      setError("You are no longer signed in. Please sign in again.");
      return;
    }

    setStatus("submitting");
    try {
      await authService.changePassword(accessToken, { currentPassword, newPassword });
      resetFields();
      setStatus("success");
      // All sessions are revoked server-side; sign out locally so the user
      // re-authenticates with the new password.
      void logout();
    } catch (err) {
      setStatus("idle");
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Could not change your password. Please try again.";
      setError(message);
    }
  }

  return (
    <SettingsSection
      id="change-password"
      title="Change password"
      description="Update your password. For your security, changing it signs you out of all sessions."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-sm">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="current-password" className="text-xs font-medium text-foreground/75">
            Current password
          </label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-password" className="text-xs font-medium text-foreground/75">
            New password
          </label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirm-new-password" className="text-xs font-medium text-foreground/75">
            Confirm new password
          </label>
          <Input
            id="confirm-new-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="text-[11px] font-medium text-destructive">
            {error}
          </p>
        )}
        {status === "success" && (
          <p role="status" className="text-[11px] font-medium text-success">
            Password changed. Signing you out…
          </p>
        )}

        <div>
          <Button type="submit" disabled={status === "submitting"}>
            {status === "submitting" ? "Changing…" : "Change password"}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
