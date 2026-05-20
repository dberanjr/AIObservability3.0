import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { usePersistedState } from "../state/usePersistedState";

/**
 * Valid samplingRatio values per Dynatrace docs (fetch spans / fetch logs).
 * `1` means no sampling — every record is included. `10` means 1 in 10, etc.
 */
export const SAMPLING_RATIOS = [1, 10, 100, 1000, 10000] as const;
export type SamplingRatio = (typeof SAMPLING_RATIOS)[number];

export const DEFAULT_SAMPLING_RATIO: SamplingRatio = 1;

export const SAMPLING_LABELS: Record<SamplingRatio, string> = {
  1: "None",
  10: "10",
  100: "100",
  1000: "1k",
  10000: "10k",
};

export interface SamplingContextValue {
  samplingRatio: SamplingRatio;
  setSamplingRatio: (next: SamplingRatio) => void;
}

const SamplingContext = createContext<SamplingContextValue | null>(null);

export const SamplingProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [samplingRatio, setRatio] = usePersistedState<SamplingRatio>(
    "ai-obs.sampling-ratio",
    DEFAULT_SAMPLING_RATIO,
  );

  const setSamplingRatio = useCallback(
    (next: SamplingRatio) => setRatio(next),
    [setRatio],
  );

  const value = useMemo<SamplingContextValue>(
    () => ({ samplingRatio, setSamplingRatio }),
    [samplingRatio, setSamplingRatio],
  );

  return (
    <SamplingContext.Provider value={value}>
      {children}
    </SamplingContext.Provider>
  );
};

export const useSampling = (): SamplingContextValue => {
  const ctx = useContext(SamplingContext);
  if (!ctx) {
    throw new Error("useSampling must be used within a SamplingProvider");
  }
  return ctx;
};
