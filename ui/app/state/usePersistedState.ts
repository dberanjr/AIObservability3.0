import { useCallback, useMemo, useState } from "react";
import {
  useSetUserAppState,
  useUserAppState,
} from "@dynatrace-sdk/react-hooks";

/**
 * Drop-in replacement for `useState` that round-trips through
 * `useUserAppState` / `useSetUserAppState` so the value persists per-user
 * across reloads. Maintains a local optimistic state so the UI feels instant
 * while the server write completes in the background.
 *
 * - Reading: JSON-deserializes the user app state value, falls back to
 *   `defaultValue` on parse error or first-load (no state yet for this key).
 * - Writing: JSON-serializes and calls setUserAppState. Errors silently fall
 *   back to local-only updates — settings should never block the UI.
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, (next: T) => void] {
  const { data } = useUserAppState({ key });
  const { execute } = useSetUserAppState();
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
        // Swallow — UI stays on the optimistic value, no point blocking on it.
      });
    },
    [execute, key],
  );

  return [value, setValue];
}
