// apps/frontend/src/hooks/useAutoSave.test.ts
import { describe, it, expect, mock } from "bun:test";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAutoSave } from "./useAutoSave";

function createSaveMock(result: "success" | "error" = "success") {
  return mock(async (value: string) => {
    if (result === "error") throw new Error("fail");
    return value;
  });
}

describe("useAutoSave", () => {
  it("debounces text saves by 600ms", async () => {
    const save = createSaveMock();
    const { result } = renderHook(() =>
      useAutoSave({ initialValue: "a", onSave: save, debounceMs: 600 })
    );

    act(() => result.current.setValue("b"));
    act(() => result.current.setValue("c"));
    expect(save).toHaveBeenCalledTimes(0);

    await new Promise((r) => setTimeout(r, 700));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toBe("c");
  });

  it("saves immediately when debounceMs is 0", async () => {
    const save = createSaveMock();
    const { result } = renderHook(() =>
      useAutoSave({ initialValue: false, onSave: save, debounceMs: 0 })
    );

    act(() => result.current.setValue(true));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toBe(true);
  });

  it("does not save when value equals the last-saved value", async () => {
    const save = createSaveMock();
    const { result } = renderHook(() =>
      useAutoSave({ initialValue: "a", onSave: save, debounceMs: 0 })
    );
    act(() => result.current.setValue("a"));
    await new Promise((r) => setTimeout(r, 50));
    expect(save).toHaveBeenCalledTimes(0);
  });

  it("transitions status to saved on success", async () => {
    const save = createSaveMock("success");
    const { result } = renderHook(() =>
      useAutoSave({ initialValue: "a", onSave: save, debounceMs: 0 })
    );
    act(() => result.current.setValue("b"));
    await waitFor(() => expect(result.current.status).toBe("saved"));
  });

  it("reverts value and exposes error on failure", async () => {
    const save = createSaveMock("error");
    const { result } = renderHook(() =>
      useAutoSave({ initialValue: "a", onSave: save, debounceMs: 0 })
    );
    act(() => result.current.setValue("b"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.value).toBe("a");
    expect(result.current.errorMessage).toBe("Couldn't save — try again");
  });

  it("clears error status when user edits again", async () => {
    const save = createSaveMock("error");
    const { result } = renderHook(() =>
      useAutoSave({ initialValue: "a", onSave: save, debounceMs: 0 })
    );
    act(() => result.current.setValue("b"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    act(() => result.current.setValue("c"));
    expect(result.current.status).toBe("idle");
  });

  it("flushes a pending value on unmount instead of dropping it (#139)", async () => {
    const save = createSaveMock();
    const { result, unmount } = renderHook(() =>
      useAutoSave({ initialValue: "a", onSave: save, debounceMs: 600 })
    );
    act(() => result.current.setValue("b"));
    // Unmount before the 600ms debounce fires.
    unmount();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toBe("b");
  });

  it("does not rewind when an error resolves after a newer keystroke (#139)", async () => {
    // First save fails slowly; a newer edit happens before it rejects.
    let rejectFirst: (e: Error) => void = () => {};
    const save = mock((value: string) => {
      if (value === "b") {
        return new Promise((_resolve, reject) => {
          rejectFirst = reject;
        });
      }
      return Promise.resolve(value);
    });
    const { result } = renderHook(() =>
      useAutoSave({ initialValue: "a", onSave: save, debounceMs: 0 })
    );
    act(() => result.current.setValue("b"));
    await waitFor(() => expect(result.current.status).toBe("saving"));
    // Newer keystroke supersedes the in-flight "b" save.
    act(() => result.current.setValue("c"));
    // Now the stale "b" save fails.
    await act(async () => {
      rejectFirst(new Error("stale fail"));
      await Promise.resolve();
    });
    // The newer value must survive; no rewind to "a", no error status.
    expect(result.current.value).toBe("c");
    expect(result.current.status).not.toBe("error");
  });

  it("ignores an out-of-order success from a superseded commit (#139)", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    const save = mock((value: string) => {
      if (value === "b") {
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve(value);
    });
    const { result } = renderHook(() =>
      useAutoSave({ initialValue: "a", onSave: save, debounceMs: 0 })
    );
    act(() => result.current.setValue("b"));
    await waitFor(() => expect(result.current.status).toBe("saving"));
    act(() => result.current.setValue("c"));
    await waitFor(() => expect(result.current.value).toBe("c"));
    // The stale "b" resolves late — it must not mark "b" as last-saved.
    await act(async () => {
      resolveFirst("b");
      await Promise.resolve();
    });
    // A later edit back to a different value should still save (lastSaved is "c").
    act(() => result.current.setValue("d"));
    await waitFor(() => expect(save.mock.calls.map((c) => c[0])).toContain("d"));
  });

  it("does not clobber an in-flight edit when initialValue changes mid-edit (#139)", async () => {
    const save = createSaveMock();
    const { result, rerender } = renderHook(
      ({ initial }) => useAutoSave({ initialValue: initial, onSave: save, debounceMs: 600 }),
      { initialProps: { initial: "a" } }
    );
    act(() => result.current.setValue("b"));
    // A server refetch delivers a new initialValue while "b" is pending.
    rerender({ initial: "server" });
    // The user's pending edit must not be overwritten by the refetch.
    expect(result.current.value).toBe("b");
  });
});
