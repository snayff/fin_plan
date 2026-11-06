import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import App, { ProtectedAppRoutes } from "./App";
import { useAuthStore } from "./stores/authStore";
import { mockUser, setAuthenticated } from "./test/helpers/auth";
import { renderWithProviders } from "./test/helpers/render";

const originalInitializeAuth = useAuthStore.getState().initializeAuth;

describe("App auth bootstrap", () => {
  beforeEach(() => {
    (window.location as any).origin = "http://localhost:3001";
    (window.location as any).href = "http://localhost:3001/overview";
    (window.location as any).pathname = "/overview";
    useAuthStore.setState({ initializeAuth: originalInitializeAuth });
  });

  afterEach(() => {
    useAuthStore.setState({ initializeAuth: originalInitializeAuth });
  });

  it("shows initialization view and does not route to login while bootstrapping", async () => {
    const initializeAuthMock = mock(() => Promise.resolve());
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      authStatus: "initializing",
      isLoading: false,
      error: null,
      initializeAuth: initializeAuthMock as any,
    });

    render(<App />);

    expect(screen.getByText("Restoring secure session...")).toBeTruthy();
    expect(screen.queryByText("Welcome Back")).toBeNull();

    await waitFor(() => {
      expect(initializeAuthMock).toHaveBeenCalled();
    });
  });
});

describe("App protected route handling", () => {
  beforeEach(() => {
    setAuthenticated(
      {
        ...mockUser,
        activeHouseholdId: "household-1",
      } as any,
      "mock-access-token"
    );
  });

  it("redirects /planner to /overview", async () => {
    renderWithProviders(<ProtectedAppRoutes />, { initialEntries: ["/planner"] });
    await waitFor(
      () => {
        expect(screen.getByTestId("overview-page")).toBeTruthy();
      },
      { timeout: 5000 }
    );
  });

  it("renders Income page at /income", async () => {
    renderWithProviders(<ProtectedAppRoutes />, { initialEntries: ["/income"] });
    await waitFor(() => {
      expect(screen.getByTestId("tier-page-income")).toBeTruthy();
    });
  });

  it("renders Surplus page at /surplus", async () => {
    renderWithProviders(<ProtectedAppRoutes />, { initialEntries: ["/surplus"] });
    await waitFor(() => {
      expect(screen.getByTestId("surplus-page")).toBeTruthy();
    });
  });

  it("renders Goals placeholder at /goals", async () => {
    renderWithProviders(<ProtectedAppRoutes />, { initialEntries: ["/goals"] });
    await waitFor(() => {
      expect(screen.getByTestId("goals-page")).toBeTruthy();
    });
  });

  it("renders Gifts placeholder at /gifts", async () => {
    renderWithProviders(<ProtectedAppRoutes />, { initialEntries: ["/gifts"] });
    await waitFor(() => {
      expect(screen.getByTestId("gifts-page")).toBeTruthy();
    });
  });

  it("redirects unknown routes to /overview", async () => {
    renderWithProviders(<ProtectedAppRoutes />, { initialEntries: ["/not-a-real-route"] });
    await waitFor(() => {
      expect(screen.getByTestId("overview-page")).toBeTruthy();
    });
  });
});
