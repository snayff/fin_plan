import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("mobile search trigger", () => {
  type MqlListener = (e: MediaQueryListEvent) => void;
  const originalMatchMedia = window.matchMedia;

  function setViewport(mobile: boolean) {
    const listeners = new Set<MqlListener>();
    window.matchMedia = (query: string): MediaQueryList =>
      ({
        matches: mobile,
        media: query,
        onchange: null,
        addEventListener: (event: string, listener: MqlListener) => {
          if (event === "change") listeners.add(listener);
        },
        removeEventListener: (event: string, listener: MqlListener) => {
          if (event === "change") listeners.delete(listener);
        },
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("shows a 44px search button in the mobile header that opens the palette", async () => {
    setViewport(true);
    const user = userEvent.setup();
    renderLayout();

    const trigger = screen.getByRole("button", { name: "Search" });
    // Hidden from lg up, where the desktop nav's trigger takes over.
    expect(trigger.className).toContain("lg:hidden");
    expect(trigger.className).toContain("h-11");
    expect(trigger.className).toContain("w-11");
    expect(screen.queryByRole("combobox")).toBeNull();

    await user.click(trigger);
    expect(await screen.findByRole("combobox")).toBeTruthy();
  });

  it("keeps the desktop search trigger", () => {
    setViewport(false);
    renderLayout();
    expect(screen.getByRole("button", { name: "Search (Ctrl+K)" })).toBeTruthy();
  });
});
