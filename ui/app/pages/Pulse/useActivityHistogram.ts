import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { useSampling } from "../../scope/SamplingContext";
import { buildActivityHistogramQuery } from "./dataQueries";
import { computeActivityHistogram, type HistogramRecord, type HistogramBucket } from "./parse";
import { DEMO_ACTIVITY_HISTOGRAM } from "./demoData";

export type { HistogramRecord, HistogramBucket };

export interface UseActivityHistogramResult {
  buckets: HistogramBucket[];
  peakHour: number | null;
  peakRequests: number;
  isLoading: boolean;
  error?: Error;
}

/**
 * `showExample` (default false, mirrors useGuardrails.ts) renders the Demo
 * Mode dataset instead of querying Grail — used by the Summary page's
 * ActivityCard. Pulse's own ActivityHistogramPanel never passes it, so its
 * behavior is unchanged.
 */
export const useActivityHistogram = (
  showExample = false,
): UseActivityHistogramResult => {
  const { samplingRatio } = useSampling();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const canQuery = canQueryScope(_resolution);

  // Honors the toolbar scan-limit selector like every other query (injected by
  // useScopedDql) — no fixed budget. If the user lowers the scan limit, the 24h
  // histogram is bounded the same as the rest of the app.
  const { data, isLoading, error } = useScopedDql<HistogramRecord>(
    canQuery ? buildActivityHistogramQuery(serviceIds) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  return useMemo<UseActivityHistogramResult>(() => {
    if (showExample) {
      return { ...DEMO_ACTIVITY_HISTOGRAM, isLoading: false, error: undefined };
    }
    const core = computeActivityHistogram(data?.records?.[0], samplingRatio);
    return {
      ...core,
      isLoading: servicesLoading || isLoading,
      error: error ?? undefined,
    };
  }, [showExample, data, isLoading, error, servicesLoading, samplingRatio]);
};
