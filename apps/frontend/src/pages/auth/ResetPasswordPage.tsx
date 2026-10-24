import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authService } from "../../services/auth.service";
import type { ApiError } from "../../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Complete a password reset (SEC-2). The single-use token arrives in the
 * `?token=` query param of the link from the reset email. On success the
 * backend revokes every session, so the user is sent back to sign in.
 */
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("This reset link is invalid or has expired.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 12) {
      setError("Password must be at least 12 characters");
      return;
    }

    setIsLoading(true);
    try {
      await authService.resetPassword({ token, newPassword: password });
      setSucceeded(true);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message || "This reset link is invalid or has expired.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-6 sm:px-6">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-foreground/10 bg-card p-6 sm:p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground">Choose a new password</h1>
          <p className="mt-2 text-muted-foreground">
            Set a new password for your account. You'll be signed out everywhere.
          </p>
        </div>

        {succeeded ? (
          <div className="space-y-6">
            <div className="rounded-md border border-success bg-success/10 p-3 text-sm text-foreground">
              Your password has been reset. Please sign in with your new password.
            </div>
            <div className="text-center text-sm">
              <Link to="/login" className="text-page-accent hover:underline">
                Go to sign in
              </Link>
            </div>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive-foreground">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-foreground">
                  New password
                </label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1"
                  placeholder="Min. 12 characters"
                />
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-foreground"
                >
                  Confirm new password
                </label>
                <Input
                  id="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1"
                  placeholder="Confirm password"
                />
              </div>

              <Button type="submit" size="lg" disabled={isLoading} className="w-full">
                {isLoading ? "Resetting..." : "Reset password"}
              </Button>
            </form>

            <div className="text-center text-sm">
              <Link to="/login" className="text-page-accent hover:underline">
                Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
