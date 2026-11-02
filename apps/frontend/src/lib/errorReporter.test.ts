import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import {
  reportError,
  installGlobalErrorHandlers,
  setErrorSink,
  resetErrorSink,
} from "./errorReporter";

describe("reportError", () => {
  afterEach(() => {
    resetErrorSink();
  });

  it("forwards the error and context to the registered sink", () => {
    const sink = mock(() => {});
    setErrorSink(sink);

    const err = new Error("boom");
    reportError(err, { source: "unit-test" });

    expect(sink).toHaveBeenCalledTimes(1);
    const [reported, context] = sink.mock.calls[0] as [Error, Record<string, unknown>];
    expect(reported).toBe(err);
    expect(context).toEqual({ source: "unit-test" });
  });

  it("normalises a non-Error value into an Error before forwarding", () => {
    const sink = mock(() => {});
    setErrorSink(sink);

    reportError("just a string");

    expect(sink).toHaveBeenCalledTimes(1);
    const [reported] = sink.mock.calls[0] as [Error];
    expect(reported).toBeInstanceOf(Error);
    expect(reported.message).toContain("just a string");
  });

  it("does not throw when no sink is registered", () => {
    resetErrorSink();
    expect(() => reportError(new Error("no sink"))).not.toThrow();
  });
});

describe("installGlobalErrorHandlers", () => {
  let addSpy: ReturnType<typeof mock>;
  let originalAdd: typeof window.addEventListener;

  beforeEach(() => {
    originalAdd = window.addEventListener.bind(window);
    addSpy = mock((...args: unknown[]) => (originalAdd as (...a: unknown[]) => void)(...args));
    window.addEventListener = addSpy as unknown as typeof window.addEventListener;
  });

  afterEach(() => {
    window.addEventListener = originalAdd;
    resetErrorSink();
  });

  it("registers window 'error' and 'unhandledrejection' listeners", () => {
    const cleanup = installGlobalErrorHandlers();
    const events = addSpy.mock.calls.map((c) => (c as unknown[])[0]);
    expect(events).toContain("error");
    expect(events).toContain("unhandledrejection");
    cleanup();
  });

  it("forwards a global 'error' event to reportError", () => {
    const sink = mock(() => {});
    setErrorSink(sink);
    const cleanup = installGlobalErrorHandlers();

    const err = new Error("global boom");
    window.dispatchEvent(new ErrorEvent("error", { error: err, message: "global boom" }));

    expect(sink).toHaveBeenCalled();
    const [reported] = sink.mock.calls[0] as [Error];
    expect(reported.message).toContain("global boom");
    cleanup();
  });

  it("forwards an unhandledrejection to reportError", () => {
    const sink = mock(() => {});
    setErrorSink(sink);
    const cleanup = installGlobalErrorHandlers();

    const reason = new Error("rejected boom");
    const event = new Event("unhandledrejection") as Event & { reason?: unknown };
    event.reason = reason;
    window.dispatchEvent(event);

    expect(sink).toHaveBeenCalled();
    const [reported] = sink.mock.calls[0] as [Error];
    expect(reported.message).toContain("rejected boom");
    cleanup();
  });
});
