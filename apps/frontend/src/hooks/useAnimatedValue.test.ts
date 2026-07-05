import { afterEach, describe, expect, it } from "bun:test";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAnimatedValue } from "./useAnimatedValue";

// useAnimatedValue interpolates from the current displayed value toward `target`
// with a snappy ease-out over ~550ms via requestAnimationFrame. It short-circuits
// to the target instantly when prefers-reduced-motion is set, or when the delta
// is below a rounding threshold. happy-dom provides requestAnimationFrame and
// performance.now, so we drive real animation frames and assert convergence.

/**
 * Force `prefers-reduced-motion` to a fixed value by stubbing window.matchMedia.
 * Returns a restore fn.
 */
function stubReducedMotion(matches: boolean): () => void {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) =>
    ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

describe("useAnimatedValue", () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("jumps straight to the target when prefers-reduced-motion is set", () => {
    restore = stubReducedMotion(true);
    const { result } = renderHook(() => useAnimatedValue(1000));
    expect(result.current).toBe(1000);
  });

  it("updates instantly to the new target on target change under reduced motion", () => {
    restore = stubReducedMotion(true);
    const { result, rerender } = renderHook(({ t }) => useAnimatedValue(t), {
      initialProps: { t: 500 },
    });
    expect(result.current).toBe(500);
    rerender({ t: 2500 });
    expect(result.current).toBe(2500);
  });

  it("no-ops to target when the delta is below the integer threshold (<1)", () => {
    // Display starts at 0; target 0.4 is below the integer threshold of 1, so it
    // snaps straight to the target without animating.
    restore = stubReducedMotion(false);
    const { result } = renderHook(() => useAnimatedValue(0.4, 0));
    expect(result.current).toBe(0.4);
  });

  it("animates toward and eventually reaches a distant target", async () => {
    restore = stubReducedMotion(false);
    const { result } = renderHook(() => useAnimatedValue(1000));

    // The ease-out reaches the exact target when progress completes (~550ms).
    await waitFor(() => expect(result.current).toBe(1000), { timeout: 2000 });
  });

  it("interpolates through intermediate values before settling (does not snap)", async () => {
    restore = stubReducedMotion(false);
    const seen: number[] = [];
    const { result } = renderHook(() => useAnimatedValue(1_000_000));

    // Sample a few frames early; at least one should be strictly between 0 and
    // the target, proving genuine interpolation rather than an instant jump.
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
      });
      seen.push(result.current);
    }
    const intermediate = seen.some((v) => v > 0 && v < 1_000_000);
    expect(intermediate).toBe(true);

    await waitFor(() => expect(result.current).toBe(1_000_000), { timeout: 2000 });
  });

  it("respects decimalPlaces rounding on the final value", async () => {
    restore = stubReducedMotion(false);
    const { result } = renderHook(() => useAnimatedValue(12.34, 2));
    await waitFor(() => expect(result.current).toBe(12.34), { timeout: 2000 });
  });

  it("animates to a new target when the target prop changes mid-life", async () => {
    restore = stubReducedMotion(false);
    const { result, rerender } = renderHook(({ t }) => useAnimatedValue(t), {
      initialProps: { t: 100 },
    });
    await waitFor(() => expect(result.current).toBe(100), { timeout: 2000 });

    rerender({ t: 5000 });
    await waitFor(() => expect(result.current).toBe(5000), { timeout: 2000 });
  });
});
