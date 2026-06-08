import { afterEach, describe, expect, test } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "./useIsMobile";

type MqlListener = (e: MediaQueryListEvent) => void;

function installMatchMedia(initialMatches: boolean): {
  fire: (matches: boolean) => void;
  restore: () => void;
} {
  const original = window.matchMedia;
  let currentMatches = initialMatches;
  const listeners = new Set<MqlListener>();

  window.matchMedia = (query: string): MediaQueryList => {
    return {
      matches: currentMatches,
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
    } as unknown as MediaQueryList;
  };

  return {
    fire: (matches: boolean) => {
      currentMatches = matches;
      listeners.forEach((listener) => {
        listener({ matches } as MediaQueryListEvent);
      });
    },
    restore: () => {
      window.matchMedia = original;
    },
  };
}

describe("useIsMobile", () => {
  let mq: ReturnType<typeof installMatchMedia> | null = null;

  afterEach(() => {
    mq?.restore();
    mq = null;
  });

  test("returns true when viewport matches (max-width: 1023px)", () => {
    mq = installMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  test("returns false when viewport does not match", () => {
    mq = installMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  test("updates when the media query result changes", () => {
    mq = installMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => mq!.fire(true));
    expect(result.current).toBe(true);

    act(() => mq!.fire(false));
    expect(result.current).toBe(false);
  });
});
