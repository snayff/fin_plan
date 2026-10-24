import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "./lib/queryClient";
import { useAuthStore } from "./stores/authStore";
import Layout from "./components/layout/Layout";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { installGlobalErrorHandlers } from "./lib/errorReporter";

// Auth pages
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const RegisterPage = lazy(() => import("./pages/auth/RegisterPage"));
const AcceptInvitePage = lazy(() => import("./pages/auth/AcceptInvitePage"));
const ForgotPasswordPage = lazy(() => import("./pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage"));

// App pages
const OverviewPage = lazy(() => import("./pages/OverviewPage"));
const ProfileSettingsPage = lazy(() => import("./pages/ProfileSettingsPage"));
const HouseholdSettingsPage = lazy(() => import("./pages/HouseholdSettingsPage"));
const DesignRenewPage = lazy(() => import("./pages/DesignRenewPage"));
const WelcomePage = lazy(() => import("./pages/WelcomePage"));
const IncomePage = lazy(() => import("./pages/IncomePage"));
const CommittedPage = lazy(() => import("./pages/CommittedPage"));
const DiscretionaryPage = lazy(() => import("./pages/DiscretionaryPage"));
const SurplusPage = lazy(() => import("./pages/SurplusPage"));
const GoalsPage = lazy(() => import("./pages/GoalsPage"));
const GiftsPage = lazy(() => import("./pages/GiftsPage"));
const HelpPage = lazy(() => import("./pages/HelpPage"));
const AssetsPage = lazy(() => import("./pages/AssetsPage"));
const ForecastPage = lazy(() => import("./pages/ForecastPage"));
const FullWaterfallPage = lazy(() => import("./pages/FullWaterfallPage"));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
    Loading...
  </div>
);

function NewUserRedirect({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user && !user.activeHouseholdId) {
    return <Navigate to="/welcome" replace />;
  }
  return <>{children}</>;
}

export function ProtectedAppRoutes() {
  return (
    <Routes>
      <Route
        path="/welcome"
        element={
          <Suspense fallback={<PageLoader />}>
            <WelcomePage />
          </Suspense>
        }
      />
      <Route
        path="/*"
        element={
          <NewUserRedirect>
            <Layout>
              <ErrorBoundary label="app-content">
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/" element={<Navigate to="/overview" replace />} />

                    {/* Primary routes */}
                    <Route path="/overview" element={<OverviewPage />} />
                    <Route path="/income" element={<IncomePage />} />
                    <Route path="/committed" element={<CommittedPage />} />
                    <Route path="/discretionary" element={<DiscretionaryPage />} />
                    <Route path="/surplus" element={<SurplusPage />} />
                    <Route path="/forecast" element={<ForecastPage />} />
                    <Route path="/assets" element={<AssetsPage />} />
                    <Route path="/goals" element={<GoalsPage />} />
                    <Route path="/gifts" element={<GiftsPage />} />
                    <Route path="/help" element={<HelpPage />} />
                    <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
                    <Route path="/settings/profile" element={<ProfileSettingsPage />} />
                    <Route path="/settings/household" element={<HouseholdSettingsPage />} />
                    <Route path="/design-renew" element={<DesignRenewPage />} />
                    <Route path="/waterfall" element={<FullWaterfallPage />} />

                    {/* Fallback */}
                    <Route path="*" element={<Navigate to="/overview" replace />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
            </Layout>
          </NewUserRedirect>
        }
      />
    </Routes>
  );
}

function App() {
  const authStatus = useAuthStore((state) => state.authStatus);
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const pathname = window.location.pathname;
  const isDesignRenewPage = import.meta.env.DEV && pathname === "/design-renew";
  const isAuthenticated = authStatus === "authenticated";

  useEffect(() => {
    // Install once so otherwise-unhandled errors/rejections are reported (RES-6).
    const uninstall = installGlobalErrorHandlers();
    return uninstall;
  }, []);

  useEffect(() => {
    if (isDesignRenewPage) return;
    void initializeAuth();
  }, [initializeAuth, isDesignRenewPage]);

  return (
    <QueryClientProvider client={queryClient}>
      {isDesignRenewPage ? (
        <Suspense fallback={<PageLoader />}>
          <DesignRenewPage />
        </Suspense>
      ) : authStatus === "initializing" ? (
        <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
          Restoring secure session...
        </div>
      ) : (
        <>
          <BrowserRouter>
            <ErrorBoundary label="auth">
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route
                    path="/login"
                    element={isAuthenticated ? <Navigate to="/overview" /> : <LoginPage />}
                  />
                  <Route
                    path="/register"
                    element={isAuthenticated ? <Navigate to="/overview" /> : <RegisterPage />}
                  />
                  <Route path="/accept-invite/:token" element={<AcceptInvitePage />} />
                  <Route
                    path="/forgot-password"
                    element={isAuthenticated ? <Navigate to="/overview" /> : <ForgotPasswordPage />}
                  />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  <Route
                    path="/*"
                    element={isAuthenticated ? <ProtectedAppRoutes /> : <Navigate to="/login" />}
                  />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </BrowserRouter>
          <ReactQueryDevtools initialIsOpen={false} />
        </>
      )}
    </QueryClientProvider>
  );
}

export default App;
