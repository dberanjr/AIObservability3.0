import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { usePersistedState } from "../../state/usePersistedState";
import {
  EMPTY_THRESHOLDS,
  type SLAThresholds,
  hasAnyThreshold,
} from "./types";

export interface SLAContextValue {
  thresholds: SLAThresholds;
  hasActive: boolean;
  setThresholds: (next: SLAThresholds) => void;
  reset: () => void;
}

const SLAContext = createContext<SLAContextValue | null>(null);

export const SLAProvider = ({ children }: { children: React.ReactNode }) => {
  const [thresholds, setThresholdsState] = usePersistedState<SLAThresholds>(
    "ai-obs.sla-thresholds",
    EMPTY_THRESHOLDS,
  );

  const setThresholds = useCallback(
    (next: SLAThresholds) => setThresholdsState(next),
    [setThresholdsState],
  );

  const reset = useCallback(
    () => setThresholdsState(EMPTY_THRESHOLDS),
    [setThresholdsState],
  );

  const value = useMemo<SLAContextValue>(
    () => ({
      thresholds,
      hasActive: hasAnyThreshold(thresholds),
      setThresholds,
      reset,
    }),
    [thresholds, setThresholds, reset],
  );

  return <SLAContext.Provider value={value}>{children}</SLAContext.Provider>;
};

export const useSLA = (): SLAContextValue => {
  const ctx = useContext(SLAContext);
  if (!ctx) {
    throw new Error("useSLA must be used within an SLAProvider");
  }
  return ctx;
};
