import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { DEFAULT_SCOPE, type Scope, type Timeframe } from "./types";
import { usePersistedState } from "../state/usePersistedState";

export interface ScopeContextValue {
  scope: Scope;
  setTimeframe: (timeframe: Timeframe) => void;
  reset: () => void;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

const FROM_PARAM = "from";
const TO_PARAM = "to";

/**
 * Parse a Timeframe from the URL search params. Returns null if no `from`
 * key is present so the caller can fall back to defaults.
 */
const readUrlTimeframe = (
  fromParam: string | null,
  toParam: string | null,
): Timeframe | null => {
  if (!fromParam) return null;
  return { from: fromParam, to: toParam ?? undefined };
};

const TIMEFRAME_PERSIST_KEY = "ai-obs.timeframe.v1";

export const ScopeProvider = ({ children }: { children: React.ReactNode }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const fromParam = searchParams.get(FROM_PARAM);
  const toParam = searchParams.get(TO_PARAM);

  // Persist the timeframe so it survives page navigations and refreshes.
  // Mirrors how GlobalFilterContext stores filters (usePersistedState → DT user app state).
  const [persistedTf, setPersistedTf] = usePersistedState<Timeframe | null>(
    TIMEFRAME_PERSIST_KEY,
    null,
  );

  // Seed initial state from URL so a pasted link / refresh restores the
  // user's timeframe. useState's initializer runs once (persisted state
  // loads async and is picked up in the effect below).
  const [scope, setScope] = useState<Scope>(() => {
    const fromUrl = readUrlTimeframe(
      new URLSearchParams(window.location.search).get(FROM_PARAM),
      new URLSearchParams(window.location.search).get(TO_PARAM),
    );
    return fromUrl ? { timeframe: fromUrl } : DEFAULT_SCOPE;
  });

  const writeUrl = useCallback(
    (tf: Timeframe | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tf) {
            next.set(FROM_PARAM, tf.from);
            if (tf.to) next.set(TO_PARAM, tf.to);
            else next.delete(TO_PARAM);
          } else {
            next.delete(FROM_PARAM);
            next.delete(TO_PARAM);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setTimeframe = useCallback(
    (timeframe: Timeframe) => {
      setScope((prev) => ({ ...prev, timeframe }));
      writeUrl(timeframe);
      setPersistedTf(timeframe);
    },
    [writeUrl, setPersistedTf],
  );

  const reset = useCallback(() => {
    setScope(DEFAULT_SCOPE);
    writeUrl(null);
    setPersistedTf(null);
  }, [writeUrl, setPersistedTf]);

  // Sync timeframe from URL or, when URL has no params, from persisted state.
  //
  // Priority: URL params (shareable links / browser nav) > persisted state >
  // keep current scope.  Writing the persisted timeframe back to the URL
  // ensures subsequent nav links in the Header carry it forward.
  useEffect(() => {
    const urlTf = readUrlTimeframe(fromParam, toParam);
    if (urlTf) {
      setScope((prev) =>
        prev.timeframe.from === urlTf.from && prev.timeframe.to === urlTf.to
          ? prev
          : { ...prev, timeframe: urlTf },
      );
    } else if (persistedTf) {
      setScope((prev) =>
        prev.timeframe.from === persistedTf.from &&
        prev.timeframe.to === persistedTf.to
          ? prev
          : { ...prev, timeframe: persistedTf },
      );
      writeUrl(persistedTf);
    }
    // else: no URL params and no persisted value → keep current in-memory scope
  }, [fromParam, toParam, persistedTf, writeUrl]);

  const value = useMemo<ScopeContextValue>(
    () => ({ scope, setTimeframe, reset }),
    [scope, setTimeframe, reset],
  );

  return (
    <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
  );
};

export const useScope = (): ScopeContextValue => {
  const ctx = useContext(ScopeContext);
  if (!ctx) {
    throw new Error("useScope must be used within a ScopeProvider");
  }
  return ctx;
};
