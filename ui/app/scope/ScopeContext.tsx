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

export const ScopeProvider = ({ children }: { children: React.ReactNode }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const fromParam = searchParams.get(FROM_PARAM);
  const toParam = searchParams.get(TO_PARAM);

  // Seed initial state from URL so a pasted link / refresh restores the
  // user's timeframe. useState's initializer runs once.
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
    },
    [writeUrl],
  );

  const reset = useCallback(() => {
    setScope(DEFAULT_SCOPE);
    writeUrl(null);
  }, [writeUrl]);

  // Reflect external URL changes (back/forward button, paste link into a
  // tab that already has the app mounted) back into scope state. Depends on
  // the string params, not the URLSearchParams object, which is unstable
  // across renders.
  useEffect(() => {
    const urlTf = readUrlTimeframe(fromParam, toParam);
    const target = urlTf ?? DEFAULT_SCOPE.timeframe;
    setScope((prev) =>
      prev.timeframe.from === target.from && prev.timeframe.to === target.to
        ? prev
        : { ...prev, timeframe: target },
    );
  }, [fromParam, toParam]);

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
