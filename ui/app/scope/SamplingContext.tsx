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

/**
 * Multiply a `count()` or `sum()` aggregate by the active sampling ratio to
 * extrapolate back to the unsampled population. With samplingRatio=N the
 * scan reads 1 in N rows, so counts/sums under-report by ~N×.
 *
 * Do NOT apply to statistics that are sampling-invariant: percentiles,
 * averages, min/max, error rates, distinctCount.
 */
export const extrapolate = (
  value: number | null | undefined,
  samplingRatio: number,
): number | null => {
  if (value == null || !Number.isFinite(value)) return value ?? null;
  return value * samplingRatio;
};

/** Element-wise version of `extrapolate` for timeseries arrays. */
export const extrapolateSeries = (
  values: number[],
  samplingRatio: number,
): number[] => values.map((v) => (Number.isFinite(v) ? v * samplingRatio : v));
