import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { DEFAULT_SCOPE, type Scope, type Timeframe } from "./types";

export interface ScopeContextValue {
  scope: Scope;
  setTimeframe: (timeframe: Timeframe) => void;
  reset: () => void;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

export const ScopeProvider = ({ children }: { children: React.ReactNode }) => {
  const [scope, setScope] = useState<Scope>(DEFAULT_SCOPE);

  const setTimeframe = useCallback((timeframe: Timeframe) => {
    setScope((prev) => ({ ...prev, timeframe }));
  }, []);

  const reset = useCallback(() => setScope(DEFAULT_SCOPE), []);

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
