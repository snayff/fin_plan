import { useCallback, useEffect, useRef, useState } from "react";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

export interface UseAutoSaveOptions<T> {
  initialValue: T;
  onSave: (value: T) => Promise<unknown>;
  debounceMs?: number;
  errorMessage?: string;
}

export interface UseAutoSaveResult<T> {
  value: T;
  setValue: (next: T) => void;
  status: AutoSaveStatus;
  errorMessage: string | null;
}

const DEFAULT_ERROR = "Couldn't save — try again";

// Stable module-level sentinel meaning "nothing pending". Module scope keeps a
// single identity across renders so ref comparisons stay valid.
const NONE = Symbol("none");

export function useAutoSave<T>({
  initialValue,
  onSave,
  debounceMs = 600,
  errorMessage = DEFAULT_ERROR,
}: UseAutoSaveOptions<T>): UseAutoSaveResult<T> {
  const [value, setLocal] = useState<T>(initialValue);
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const lastSavedRef = useRef<T>(initialValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The value waiting to be committed (set on edit, cleared once committed).
  // The module-level NONE sentinel means "nothing pending".
  const pendingRef = useRef<T | typeof NONE>(NONE);

  // Monotonic id stamped on each commit so out-of-order/stale resolutions of an
  // earlier save can be ignored once a newer edit has been made.
  const commitSeqRef = useRef(0);
  // The id of the most recent edit; a commit is "current" only if no newer edit
  // happened while it was in flight.
  const latestSeqRef = useRef(0);

  // Keep the latest onSave without making commit identity churn.
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const commit = useCallback(async (next: T, seq: number) => {
    setStatus("saving");
    pendingRef.current = NONE;
    try {
      await onSaveRef.current(next);
      // Ignore the result if a newer edit superseded this commit.
      if (seq !== latestSeqRef.current) return;
      lastSavedRef.current = next;
      setStatus("saved");
    } catch {
      // Only revert/flag error if this is still the newest commit — a newer
      // keystroke must not be rewound by a stale failure.
      if (seq !== latestSeqRef.current) return;
      setLocal(lastSavedRef.current);
      setStatus("error");
    }
  }, []);

  const setValue = useCallback(
    (next: T) => {
      setLocal(next);
      setStatus("idle");
      if (timerRef.current) clearTimeout(timerRef.current);
      if (Object.is(next, lastSavedRef.current)) {
        pendingRef.current = NONE;
        return;
      }

      const seq = ++commitSeqRef.current;
      latestSeqRef.current = seq;
      pendingRef.current = next;
      timerRef.current = setTimeout(() => void commit(next, seq), debounceMs);
    },
    [commit, debounceMs]
  );

  // Sync from external changes (e.g. server refresh). Only resync when idle and
  // nothing is pending, so an in-flight edit is never clobbered by a refetch.
  useEffect(() => {
    if (pendingRef.current !== NONE) return;
    if (status === "saving") return;
    lastSavedRef.current = initialValue;
    setLocal(initialValue);
    // status is read but should not retrigger; resync is keyed on initialValue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue]);

  // On unmount: flush a pending value (don't just drop it) so a debounced edit
  // is not lost when the field unmounts before the timer fires.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const pending = pendingRef.current;
      if (pending !== NONE) {
        pendingRef.current = NONE;
        // Fire-and-forget; the component is gone so we cannot update state.
        // Swallow rejections — there is no longer a UI to surface them on.
        void Promise.resolve(onSaveRef.current(pending)).catch(() => {});
      }
    };
  }, []);

  return {
    value,
    setValue,
    status,
    errorMessage: status === "error" ? errorMessage : null,
  };
}
