import { describe, it, expect, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { SearchPalette } from "../SearchPalette";

function renderPalette(open = true, onOpenChange = () => {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/overview"]}>
        <SearchPalette open={open} onOpenChange={onOpenChange} userId="u-1" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderRoutedPalette() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/overview"]}>
        <SearchPalette open onOpenChange={() => {}} userId="u-scope" />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const result = (over: Record<string, string>) => ({
  id: "x1",
  name: "Holiday fund",
  subtitle: "Discretionary · Item",
  route: "/discretionary",
  focusId: "x1",
  kind: "discretionary_item",
  ...over,
});

describe("SearchPalette — destination scoping", () => {
  it("selects the result's subcategory alongside the focus param", async () => {
    server.use(
      http.get("http://localhost:3001/api/search", () =>
        HttpResponse.json({ results: [result({ subcategoryId: "sub-hols" })] })
      )
    );
    const user = userEvent.setup();
    renderRoutedPalette();
    await user.type(screen.getByRole("combobox"), "holiday");
    await user.click(await screen.findByText("Holiday fund"));
    const url = new URL(`http://x${screen.getByTestId("location").textContent}`);
    expect(url.pathname).toBe("/discretionary");
    expect(url.searchParams.get("focus")).toBe("x1");
    expect(url.searchParams.get("subcategory")).toBe("sub-hols");
  });

  it("selects the asset/account type alongside the focus param", async () => {
    server.use(
      http.get("http://localhost:3001/api/search", () =>
        HttpResponse.json({
          results: [
            result({ kind: "account", route: "/assets", name: "Rainy day pot", type: "Savings" }),
          ],
        })
      )
    );
    const user = userEvent.setup();
    renderRoutedPalette();
    await user.type(screen.getByRole("combobox"), "rainy");
    await user.click(await screen.findByText("Rainy day pot"));
    const url = new URL(`http://x${screen.getByTestId("location").textContent}`);
    expect(url.pathname).toBe("/assets");
    expect(url.searchParams.get("type")).toBe("Savings");
    expect(url.searchParams.get("focus")).toBe("x1");
  });

  it("re-opens a recent data result with the same scoping params", async () => {
    localStorage.clear();
    server.use(
      http.get("http://localhost:3001/api/search", () =>
        HttpResponse.json({ results: [result({ subcategoryId: "sub-hols" })] })
      )
    );
    const user = userEvent.setup();
    const first = renderRoutedPalette();
    await user.type(screen.getByRole("combobox"), "holiday");
    await user.click(await screen.findByText("Holiday fund"));
    first.unmount();

    renderRoutedPalette();
    await user.click(await screen.findByText("Holiday fund")); // listed under Recent
    const url = new URL(`http://x${screen.getByTestId("location").textContent}`);
    expect(url.searchParams.get("subcategory")).toBe("sub-hols");
    expect(url.searchParams.get("focus")).toBe("x1");
  });
});

describe("SearchPalette", () => {
  it("renders the input when open", () => {
    server.use(
      http.get("http://localhost:3001/api/search", () => HttpResponse.json({ results: [] }))
    );
    renderPalette(true);
    // cmdk renders Command.Input as role="combobox"
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("shows 'No results' when a non-empty query yields nothing", async () => {
    server.use(
      http.get("http://localhost:3001/api/search", () => HttpResponse.json({ results: [] }))
    );
    const user = userEvent.setup();
    renderPalette(true);
    await user.type(screen.getByRole("combobox"), "zzz-no-match");
    expect(await screen.findByText(/No results/i)).toBeInTheDocument();
  });
});

describe("SearchPalette — error and loading states", () => {
  it("shows an error row (not 'No results') when search fails, keeping other matches", async () => {
    server.use(
      http.get("http://localhost:3001/api/search", () =>
        HttpResponse.json({ error: { message: "boom" } }, { status: 500 })
      )
    );
    const user = userEvent.setup();
    renderPalette(true);
    // "income" also matches the "Go to Income" action, which must still show.
    await user.type(screen.getByRole("combobox"), "income");
    expect(await screen.findByText(/search unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/No results/i)).toBeNull();
    expect(screen.getByText("Go to Income")).toBeInTheDocument();
  });

  it("retries from the error row", async () => {
    let calls = 0;
    server.use(
      http.get("http://localhost:3001/api/search", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ error: { message: "boom" } }, { status: 500 })
          : HttpResponse.json({
              results: [
                {
                  kind: "income_source",
                  id: "i1",
                  name: "Salary",
                  subtitle: "Income · Source",
                  route: "/income",
                  focusId: "i1",
                },
              ],
            });
      })
    );
    const user = userEvent.setup();
    renderPalette(true);
    await user.type(screen.getByRole("combobox"), "salary");
    await user.click(await screen.findByText(/search unavailable/i));
    expect(await screen.findByText("Salary")).toBeInTheDocument();
    expect(screen.queryByText(/search unavailable/i)).toBeNull();
  });

  it("shows a searching state, not 'No results', while the request is in flight", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      http.get("http://localhost:3001/api/search", async () => {
        await gate;
        return HttpResponse.json({ results: [] });
      })
    );
    const user = userEvent.setup();
    renderPalette(true);
    await user.type(screen.getByRole("combobox"), "zzz-no-match");
    expect(await screen.findByText(/searching/i)).toBeInTheDocument();
    expect(screen.queryByText(/No results/i)).toBeNull();
    release();
    expect(await screen.findByText(/No results/i)).toBeInTheDocument();
  });

  it("announces status text to screen readers", async () => {
    server.use(
      http.get("http://localhost:3001/api/search", () => HttpResponse.json({ results: [] }))
    );
    const user = userEvent.setup();
    renderPalette(true);
    await user.type(screen.getByRole("combobox"), "zzz-no-match");
    const status = await screen.findByText(/No results/i);
    expect(status.closest("[aria-live]")).not.toBeNull();
  });
});

describe("SearchPalette — desktop-only badges on mobile", () => {
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

  const giftResults = [
    result({
      kind: "gift_person",
      id: "gp1",
      focusId: "gp1",
      name: "Gift recipient match",
      subtitle: "Gifts · Person",
      route: "/gifts",
    }),
    result({
      kind: "gift_event",
      id: "ge1",
      focusId: "ge1",
      name: "Gift event match",
      subtitle: "Gifts · Event",
      route: "/gifts",
    }),
    result({ id: "d1", focusId: "d1", name: "Gift wrap budget" }),
  ];

  const rowFor = async (title: string) => {
    const row = (await screen.findByText(title)).closest<HTMLElement>("[cmdk-item]");
    if (!row) throw new Error(`no palette row for ${title}`);
    return row;
  };

  it("badges gift results and gift actions, but not mobile-ready results", async () => {
    setViewport(true);
    server.use(
      http.get("http://localhost:3001/api/search", () =>
        HttpResponse.json({ results: giftResults })
      )
    );
    const user = userEvent.setup();
    renderPalette(true);
    await user.type(screen.getByRole("combobox"), "gift");

    for (const title of [
      "Gift recipient match",
      "Gift event match",
      "Add gift recipient",
      "Add gift event",
      "Go to Gifts",
    ]) {
      expect(within(await rowFor(title)).queryByText(/desktop only/i)).not.toBeNull();
    }
    expect(within(await rowFor("Gift wrap budget")).queryByText(/desktop only/i)).toBeNull();
  });

  it("does not badge gift destinations on desktop", async () => {
    setViewport(false);
    server.use(
      http.get("http://localhost:3001/api/search", () =>
        HttpResponse.json({ results: giftResults })
      )
    );
    const user = userEvent.setup();
    renderPalette(true);
    await user.type(screen.getByRole("combobox"), "gift");
    await screen.findByText("Gift recipient match");
    expect(screen.queryByText(/desktop only/i)).toBeNull();
  });
});
