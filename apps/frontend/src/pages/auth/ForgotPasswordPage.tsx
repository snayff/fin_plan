import { useState } from "react";
import { Link } from "react-router-dom";
import { authService } from "../../services/auth.service";
import type { ApiError } from "../../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Request a password-reset email (SEC-2). To avoid account enumeration the UI
 * shows the same generic confirmation whether or not the email is registered —
 * the backend already returns an identical response in both cases.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await authService.forgotPassword(email);
      // Always land on the generic confirmation, regardless of account existence.
      setSubmitted(true);
    } catch (err) {
      const apiError = err as ApiError;
      // Only surfaced for genuine client errors (e.g. malformed email / rate limit).
      setError(apiError?.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-6 sm:px-6">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-foreground/10 bg-card p-6 sm:p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground">Reset your password</h1>
          <p className="mt-2 text-muted-foreground">
            Enter your email and we'll send you a link to set a new password.
          </p>
        </div>

        {submitted ? (
          <div className="space-y-6">
            <div className="rounded-md border border-success bg-success/10 p-3 text-sm text-foreground">
              If an account exists for that email, a reset link has been sent. Check your inbox and
              follow the link within the hour.
            </div>
            <div className="text-center text-sm">
              <Link to="/login" className="text-page-accent hover:underline">
                Back to sign in
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
                <label htmlFor="email" className="block text-sm font-medium text-foreground">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1"
                  placeholder="you@example.com"
                />
              </div>

              <Button type="submit" size="lg" disabled={isLoading} className="w-full">
                {isLoading ? "Sending..." : "Send reset link"}
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
