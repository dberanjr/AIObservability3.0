import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { useSampling } from "../../scope/SamplingContext";
import { buildActivityHistogramQuery } from "./dataQueries";

interface HistogramRecord {
  requests?: (number | null)[] | null;
}

export interface HistogramBucket {
  hour: number;
  requests: number;
}

export interface UseActivityHistogramResult {
  buckets: HistogramBucket[];
  peakHour: number | null;
  peakRequests: number;
  isLoading: boolean;
  error?: Error;
}

export const useActivityHistogram = (): UseActivityHistogramResult => {
  const { samplingRatio } = useSampling();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const canQuery = canQueryScope(_resolution);

  const { data, isLoading, error } = useScopedDql<HistogramRecord>(
    canQuery ? buildActivityHistogramQuery(serviceIds) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<UseActivityHistogramResult>(() => {
    const row = data?.records?.[0];
    // Each bucket is a count() of requests — extrapolate every bucket.
    const series = (row?.requests ?? []).map((v) =>
      typeof v === "number" ? v * samplingRatio : 0,
    );
    // Pad or trim to 24 buckets.
    const buckets: HistogramBucket[] = Array.from(
      { length: 24 },
      (_, i) => ({ hour: i, requests: series[i] ?? 0 }),
    );

    let peakHour: number | null = null;
    let peakRequests = 0;
    for (const b of buckets) {
      if (b.requests > peakRequests) {
        peakRequests = b.requests;
        peakHour = b.hour;
      }
    }

    return {
      buckets,
      peakHour,
      peakRequests,
      isLoading: servicesLoading || isLoading,
      error: error ?? undefined,
    };
  }, [data, isLoading, error, servicesLoading, samplingRatio]);
};
