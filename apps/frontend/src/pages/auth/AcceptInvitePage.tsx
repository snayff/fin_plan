import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../stores/authStore";
import { householdService } from "../../services/household.service";
import { authService } from "../../services/auth.service";
import type { ApiError } from "../../lib/api";
import { Input } from "@/components/ui/input";

type PageState =
  | { status: "loading" }
  | { status: "invalid"; message: string }
  | {
      status: "ready";
      householdName: string;
      emailRequired: boolean;
      maskedInvitedEmail: string | null;
    }
  | { status: "joining"; householdName: string }
  | { status: "success"; householdName: string };

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAuthenticated, setUser, login } = useAuthStore();

  const [pageState, setPageState] = useState<PageState>({ status: "loading" });
  // Toggle between new-user signup and existing-user login
  const [mode, setMode] = useState<"new" | "existing">("new");

  // Signup fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const joinStartedRef = useRef(false);

  const performJoin = useCallback(
    async (householdName: string, emailRequired: boolean, maskedInvitedEmail: string | null) => {
      if (!token || joinStartedRef.current) return;
      joinStartedRef.current = true;
      setIsSubmitting(true);
      setError("");
      setPageState({ status: "joining", householdName });
      try {
        await householdService.joinViaInvite(token);
        setPageState({ status: "success", householdName });
        const { user: updatedUser } = await authService.getCurrentUser(
          useAuthStore.getState().accessToken!
        );
        setUser(updatedUser, useAuthStore.getState().accessToken!);
        void qc.invalidateQueries();
        setTimeout(() => navigate("/overview"), 1500);
      } catch (err) {
        setPageState({ status: "ready", householdName, emailRequired, maskedInvitedEmail });
        setError((err as ApiError).message || "Failed to join household");
      } finally {
        setIsSubmitting(false);
      }
    },
    [token, qc, navigate, setUser]
  );

  useEffect(() => {
    if (!token) {
      setPageState({ status: "invalid", message: "Invalid invite link." });
      return;
    }

    householdService
      .validateInvite(token)
      .then((info) => {
        setPageState({
          status: "ready",
          householdName: info.householdName,
          emailRequired: info.emailRequired,
          maskedInvitedEmail: info.maskedInvitedEmail,
        });
      })
      .catch(() => {
        setPageState({
          status: "invalid",
          message: "This invite link is invalid or has expired.",
        });
      });
  }, [token]);

  useEffect(() => {
    if (isAuthenticated && pageState.status === "ready") {
      void performJoin(
        pageState.householdName,
        pageState.emailRequired,
        pageState.maskedInvitedEmail
      );
    }
  }, [isAuthenticated, pageState, performJoin]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || pageState.status !== "ready") return;
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const result = await householdService.acceptInvite(token, {
        name,
        email,
        password,
      });
      setUser(result.user, result.accessToken);
      setPageState({ status: "success", householdName: pageState.householdName });
      setTimeout(() => navigate("/overview"), 1500);
    } catch (err) {
      setError((err as ApiError).message || "Failed to create account");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pageState.status !== "ready") return;
    const { householdName, emailRequired, maskedInvitedEmail } = pageState;
    setIsSubmitting(true);
    setError("");
    try {
      await login({ email: loginEmail, password: loginPassword });
    } catch (err) {
      setError((err as ApiError).message || "Sign in failed");
      setIsSubmitting(false);
      return;
    }
    // performJoin manages isSubmitting from here; do NOT set false
    void performJoin(householdName, emailRequired, maskedInvitedEmail);
  };

  if (pageState.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        Validating invite link...
      </div>
    );
  }

  if (pageState.status === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-md p-8 text-center bg-card rounded-lg shadow-lg">
          <h1 className="text-2xl font-bold text-foreground mb-3">Invite Link Invalid</h1>
          <p className="text-muted-foreground">{pageState.message}</p>
        </div>
      </div>
    );
  }

  if (pageState.status === "joining") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-md p-8 text-center bg-card rounded-lg shadow-lg">
          <h1 className="text-2xl font-bold text-foreground mb-3">
            Joining {pageState.householdName}…
          </h1>
          <p className="text-muted-foreground">Please wait.</p>
        </div>
      </div>
    );
  }

  if (pageState.status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-md p-8 text-center bg-card rounded-lg shadow-lg">
          <h1 className="text-2xl font-bold text-foreground mb-3">You're in!</h1>
          <p className="text-muted-foreground">
            You've joined <strong>{pageState.householdName}</strong>. Redirecting...
          </p>
        </div>
      </div>
    );
  }

  const { householdName, emailRequired, maskedInvitedEmail } = pageState;

  // Logged-in user: show join confirmation
  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-lg shadow-lg">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-foreground">You're Invited</h1>
            <p className="mt-2 text-muted-foreground">
              Join <strong>{householdName}</strong>
            </p>
          </div>

          {emailRequired && maskedInvitedEmail && (
            <div className="p-3 text-sm rounded-md border bg-muted/40 text-foreground">
              This invite must be completed using the invited email address{" "}
              <strong>{maskedInvitedEmail}</strong>.
            </div>
          )}

          {error && (
            <div className="p-3 text-sm text-destructive-foreground bg-destructive/10 rounded-md border border-destructive">
              {error}
            </div>
          )}

          <button
            onClick={() => {
              joinStartedRef.current = false;
              void performJoin(householdName, emailRequired, maskedInvitedEmail);
            }}
            disabled={isSubmitting}
            className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? "Joining…" : "Try again"}
          </button>
        </div>
      </div>
    );
  }

  // Not logged in — show mode toggle + form
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-lg shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground">You're Invited</h1>
          <p className="mt-2 text-muted-foreground">
            Join <strong>{householdName}</strong>
          </p>
        </div>

        {emailRequired && maskedInvitedEmail && (
          <div className="p-3 text-sm rounded-md border bg-muted/40 text-foreground">
            This invite must be completed using the invited email address{" "}
            <strong>{maskedInvitedEmail}</strong>.
          </div>
        )}

        {/* Mode toggle */}
        <div className="flex rounded-md border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => {
              setMode("new");
              setError("");
            }}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === "new"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            I'm new
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("existing");
              setError("");
            }}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === "existing"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            I have an account
          </button>
        </div>

        {error && (
          <div className="p-3 text-sm text-destructive-foreground bg-destructive/10 rounded-md border border-destructive">
            {error}
          </div>
        )}

        {mode === "new" ? (
          /* New user signup */
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-foreground">
                Your Name
              </label>
              <Input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
                placeholder="Jane Smith"
              />
            </div>

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
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground">
                Password
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
                Confirm Password
              </label>
              <Input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1"
                placeholder="Repeat password"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? "Creating account..." : "Create Account & Join"}
            </button>
          </form>
        ) : (
          /* Existing user login */
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-foreground">
                Email
              </label>
              <Input
                id="login-email"
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="mt-1"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-foreground">
                Password
              </label>
              <Input
                id="login-password"
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="mt-1"
                placeholder="Your password"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? "Signing in..." : "Sign In"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
