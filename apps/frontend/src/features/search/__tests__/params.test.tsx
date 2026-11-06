import { describe, it, expect, vi } from "vitest";
import { useEffect, useState } from "react";
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useFocusParam } from "../useFocusParam";
import { useAddParam } from "../useAddParam";

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location">{location.pathname + location.search}</output>
      <button onClick={() => navigate(-1)}>back</button>
    </>
  );
}

/** Renders the focus target only once `showAfterMs` has elapsed, like rows arriving with data. */
function FocusPage({ ready, showAfterMs = 0 }: { ready: boolean; showAfterMs?: number }) {
  const [show, setShow] = useState(showAfterMs === 0);
  useEffect(() => {
    if (showAfterMs === 0) return;
    const t = setTimeout(() => setShow(true), showAfterMs);
    return () => clearTimeout(t);
  }, [showAfterMs]);
  useFocusParam({ ready, maxWaitMs: 500 });
  return (
    <>
      {show && <div data-testid="target" data-search-focus="abc" />}
      <LocationProbe />
    </>
  );
}

function renderAt(page: React.ReactNode, entries = ["/x?focus=abc"]) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Routes>
        <Route path="/start" element={<LocationProbe />} />
        <Route path="/x" element={page} />
      </Routes>
    </MemoryRouter>
  );
}

const location = () => screen.getByTestId("location").textContent;

describe("useFocusParam", () => {
  it("highlights the target and strips the param once the page is ready", async () => {
    const { rerender } = renderAt(<FocusPage ready={false} />);
    // Not ready yet: nothing happens and the param survives.
    expect(screen.getByTestId("target").classList.contains("search-focus-pulse")).toBe(false);
    expect(location()).toBe("/x?focus=abc");

    rerender(
      <MemoryRouter initialEntries={["/x?focus=abc"]}>
        <Routes>
          <Route path="/x" element={<FocusPage ready />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByTestId("target").classList.contains("search-focus-pulse")).toBe(true)
    );
    expect(location()).toBe("/x");
  });

  it("keeps waiting on a cold load until the row renders, then focuses it", async () => {
    renderAt(<FocusPage ready showAfterMs={150} />);
    expect(location()).toBe("/x?focus=abc"); // not stripped while the row is missing
    await waitFor(() =>
      expect(screen.getByTestId("target").classList.contains("search-focus-pulse")).toBe(true)
    );
    expect(location()).toBe("/x");
  });

  it("gives up and strips the param when the row never appears", async () => {
    renderAt(<FocusPage ready showAfterMs={60_000} />);
    await waitFor(() => expect(location()).toBe("/x"), { timeout: 1500 });
    expect(screen.queryByTestId("target")).toBeNull();
  });

  it("strips with replace, so browser-back does not re-trigger the focus", async () => {
    renderAt(<FocusPage ready />, ["/start", "/x?focus=abc"]);
    await waitFor(() => expect(location()).toBe("/x"));
    fireEvent.click(screen.getByText("back"));
    expect(location()).toBe("/start");
  });

  it("ignores ids that are not valid record ids", async () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    renderAt(<FocusPage ready />, ['/x?focus="]),body']);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(location()).toBe("/x");
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it("does nothing when the param is absent", () => {
    renderAt(<FocusPage ready />, ["/x"]);
    expect(screen.getByTestId("target").classList.contains("search-focus-pulse")).toBe(false);
  });
});

function AddPage() {
  const intent = useAddParam();
  return (
    <>
      <output data-testid="intent">{intent ?? "none"}</output>
      <LocationProbe />
    </>
  );
}

describe("useAddParam", () => {
  it("returns the ?add=<kind> captured on arrival and strips the param", async () => {
    renderAt(<AddPage />, ["/x?add=asset&type=Property"]);
    expect(screen.getByTestId("intent").textContent).toBe("asset");
    // Stripped from the URL, but the captured intent survives the re-render.
    await waitFor(() => expect(location()).toBe("/x?type=Property"));
    expect(screen.getByTestId("intent").textContent).toBe("asset");
  });

  it("returns null when the param is absent", () => {
    renderAt(<AddPage />, ["/x"]);
    expect(screen.getByTestId("intent").textContent).toBe("none");
  });
});
