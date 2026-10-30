/**
 * errorReporter — the single seam through which the frontend surfaces caught
 * errors (RES-6). Today it logs in development and forwards to an injectable
 * "sink"; a real tracker (Sentry, etc.) can later be plugged in via
 * {@link setErrorSink} without touching call sites. No third-party dependency
 * is introduced here on purpose — this is only the abstraction.
 */

/** Free-form structured context attached to a reported error. */
export type ErrorContext = Record<string, unknown>;

/** A destination that receives normalised errors (e.g. a real tracker). */
export type ErrorSink = (error: Error, context?: ErrorContext) => void;

let sink: ErrorSink | null = null;

/**
 * Register the destination that {@link reportError} forwards to. Call once at
 * app boot when wiring a real tracker. Replaces any previously-set sink.
 */
export function setErrorSink(next: ErrorSink): void {
  sink = next;
}

/** Remove the registered sink. Primarily for tests. */
export function resetErrorSink(): void {
  sink = null;
}

/** Coerce any thrown value into an Error so downstream handling is uniform. */
function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === "string") return new Error(value);
  try {
    return new Error(`Non-Error thrown: ${JSON.stringify(value)}`);
  } catch {
    return new Error("Non-Error thrown (unserialisable)");
  }
}

/**
 * Report an error. Always logs in development; forwards to the registered sink
 * (if any) in every environment. Never throws — reporting must not mask the
 * original failure.
 */
export function reportError(error: unknown, context?: ErrorContext): void {
  const normalised = toError(error);

  if (import.meta.env.DEV) {
    console.error("[errorReporter]", normalised, context ?? {});
  }

  if (sink) {
    try {
      sink(normalised, context);
    } catch (sinkError) {
      if (import.meta.env.DEV) {
        console.error("[errorReporter] sink threw:", sinkError);
      }
    }
  }
}

/**
 * Install global `error` and `unhandledrejection` listeners that route
 * otherwise-unhandled failures through {@link reportError}. Call once from the
 * app entry point. Returns a cleanup function that removes the listeners.
 */
export function installGlobalErrorHandlers(): () => void {
  const onError = (event: ErrorEvent) => {
    reportError(event.error ?? event.message, { source: "window.error" });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    reportError(event.reason, { source: "window.unhandledrejection" });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
