import { useCallback, useMemo, useState } from "react";
import { useAppState, useSetAppState } from "@dynatrace-sdk/react-hooks";

/**
 * Drop-in `useState`-shaped hook that round-trips through Dynatrace's
 * org-wide app-state APIs (`state:app-states:read` / `write`). Whatever
 * one user sets here is visible to every user of the app — the right
 * scope for shared config like the Model Pricing panel.
 *
 * - Reads: JSON-deserializes the app-state value; falls back to
 *   `defaultValue` when the key isn't set yet or fails to parse.
 * - Writes: optimistic local update + JSON-serialized POST. Errors are
 *   swallowed; the optimistic value sticks so the UI stays responsive.
 */
export function usePersistedAppState<T>(
  key: string,
  defaultValue: T,
): [T, (next: T) => void] {
  const { data } = useAppState({ key });
  const { execute } = useSetAppState();
  const [optimistic, setOptimistic] = useState<T | undefined>(undefined);

  const remoteValue = useMemo<T>(() => {
    const raw = data?.value;
    if (typeof raw !== "string" || raw.length === 0) return defaultValue;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  }, [data, defaultValue]);

  const value = optimistic ?? remoteValue;

  const setValue = useCallback(
    (next: T) => {
      setOptimistic(next);
      void execute({ key, body: { value: JSON.stringify(next) } }).catch(() => {
        /* swallow — UI stays on the optimistic value. */
      });
    },
    [execute, key],
  );

  return [value, setValue];
}
