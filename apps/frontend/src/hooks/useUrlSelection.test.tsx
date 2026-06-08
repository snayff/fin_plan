import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useUrlSelection } from "./useUrlSelection";

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

function makeWrapper(initialPath = "/foo") {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/foo" element={<>{children}</>} />
        </Routes>
      </MemoryRouter>
    );
  };
}

describe("useUrlSelection", () => {
  beforeEach(() => setViewport(false));
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  test("reads value from URL on mount", () => {
    const { result } = renderHook(() => useUrlSelection({ param: "subcategory" }), {
      wrapper: makeWrapper("/foo?subcategory=abc"),
    });
    expect(result.current[0]).toBe("abc");
  });

  test("returns null when param is absent", () => {
    const { result } = renderHook(() => useUrlSelection({ param: "subcategory" }), {
      wrapper: makeWrapper(),
    });
    expect(result.current[0]).toBeNull();
  });

  test("setValue updates the URL", () => {
    const { result } = renderHook(() => useUrlSelection({ param: "type" }), {
      wrapper: makeWrapper(),
    });
    act(() => result.current[1]("Property"));
    expect(result.current[0]).toBe("Property");
  });

  test("clear removes the param", () => {
    const { result } = renderHook(() => useUrlSelection({ param: "subcategory" }), {
      wrapper: makeWrapper("/foo?subcategory=abc"),
    });
    act(() => result.current[2]());
    expect(result.current[0]).toBeNull();
  });

  test("coexists with other URL params (does not clobber)", () => {
    // capture location via a sibling hook
    let location: ReturnType<typeof useLocation> | null = null;
    function CaptureLocation() {
      location = useLocation();
      return null;
    }

    const { result } = renderHook(
      () => {
        return useUrlSelection({ param: "subcategory" });
      },
      {
        wrapper: ({ children }) => (
          <MemoryRouter initialEntries={["/foo?add=1&focus=xyz"]}>
            <Routes>
              <Route
                path="/foo"
                element={
                  <>
                    <CaptureLocation />
                    {children}
                  </>
                }
              />
            </Routes>
          </MemoryRouter>
        ),
      }
    );

    act(() => result.current[1]("abc"));
    const search = location!.search;
    expect(search).toContain("add=1");
    expect(search).toContain("focus=xyz");
    expect(search).toContain("subcategory=abc");
  });

  test("invalid value clears silently when validate fails", async () => {
    const validate = (v: string) => v === "Property";
    const { result } = renderHook(() => useUrlSelection({ param: "type", validate }), {
      wrapper: makeWrapper("/foo?type=Bogus"),
    });
    // initial render reads the URL value before the effect runs to clear it
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current[0]).toBeNull();
  });

  test("valid value is preserved when validate passes", async () => {
    const validate = (v: string) => v === "Property";
    const { result } = renderHook(() => useUrlSelection({ param: "type", validate }), {
      wrapper: makeWrapper("/foo?type=Property"),
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current[0]).toBe("Property");
  });
});
