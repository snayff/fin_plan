import { describe, it, expect, mock } from "bun:test";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import Layout from "./Layout";
import { useAuthStore } from "@/stores/authStore";

mock.module("@/hooks/useStaleDataBanner", () => ({
  useStaleDataBanner: () => ({ showBanner: false, erroredAt: null }),
}));

function renderLayout(path = "/overview") {
  useAuthStore.setState({
    user: { id: "1", name: "Test", email: "t@test.com" } as any,
    accessToken: "tok",
    isAuthenticated: true,
    authStatus: "authenticated",
  } as any);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Layout>
          <div>content</div>
        </Layout>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("TopNav", () => {
  it("renders all 8 nav items", () => {
    renderLayout();
    expect(screen.getByRole("link", { name: /overview/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /income/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /committed/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /discretionary/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /surplus/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /goals/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /gifts/i })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /settings/i })).toBeNull();
  });

  it("marks the active route with aria-current", () => {
    renderLayout("/income");
    const incomeLink = screen.getByRole("link", { name: /income/i });
    expect(incomeLink.getAttribute("aria-current")).toBe("page");
    const overviewLink = screen.getByRole("link", { name: /overview/i });
    expect(overviewLink.getAttribute("aria-current")).toBeNull();
  });

  it("renders two separators between nav groups", () => {
    renderLayout();
    const separators = screen.getAllByRole("separator");
    expect(separators).toHaveLength(2);
  });

  it("shows StaleDataBanner when showBanner is true", () => {
    mock.module("@/hooks/useStaleDataBanner", () => ({
      useStaleDataBanner: () => ({ showBanner: true, erroredAt: new Date() }),
    }));
    renderLayout();
    expect(screen.getByText(/couldn't sync/i)).toBeTruthy();
  });

  it("renders a Help nav link pointing to /help", () => {
    renderLayout();
    const helpLink = screen.getByRole("link", { name: "Help" });
    expect(helpLink).toBeTruthy();
    expect(helpLink.getAttribute("href")).toContain("/help");
  });
});
