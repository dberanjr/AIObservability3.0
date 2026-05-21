import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { useSampling } from "../../scope/SamplingContext";
import { buildTokenSeriesQuery } from "./dataQueries";
import { estimateCost, getPricing } from "../../data/pricing";
import { toNum } from "../../data/format";

interface SeriesRecord {
  tokens?: (number | null)[] | null;
  timeframe?: { start?: string; end?: string } | null;
  interval?: string | null;
}

export interface TokenSeriesPoint {
  t: number;
  tokens: number;
  estCost: number;
}

export interface UseTokenConsumptionResult {
  points: TokenSeriesPoint[];
  intervalMs: number;
  /** Human-readable bucket label like "5m", "1h", "6h". */
  intervalLabel: string;
  totalTokens: number;
  totalCost: number;
  isLoading: boolean;
  error?: Error;
}

/**
 * Snapped bucket sizes, in seconds. The hook picks the smallest snapped
 * value that's >= the ideal interval derived from the active timeframe
 * (totalMs / TARGET_BUCKETS). Means a 24h window snaps to 5m, 7d to 1h,
 * etc. — friendlier than the raw `floor(totalMs / 240 / 1000)` math.
 */
const SNAPPED_BUCKETS_SEC: ReadonlyArray<{ sec: number; label: string }> = [
  { sec: 60, label: "1m" },
  { sec: 300, label: "5m" },
  { sec: 900, label: "15m" },
  { sec: 1800, label: "30m" },
  { sec: 3600, label: "1h" },
  { sec: 21600, label: "6h" },
  { sec: 86400, label: "1d" },
];
const TARGET_BUCKETS = 240;

const pickSnappedBucket = (
  totalMs: number,
): { sec: number; label: string } => {
  const ideal = Math.max(60, Math.floor(totalMs / TARGET_BUCKETS / 1000));
  for (const b of SNAPPED_BUCKETS_SEC) {
    if (b.sec >= ideal) return b;
  }
  return SNAPPED_BUCKETS_SEC[SNAPPED_BUCKETS_SEC.length - 1];
};

const parseScopeMs = (from: string): number => {
  const m = /now\(\)\s*-\s*(\d+)([mhd])/i.exec(from);
  if (!m) return 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  switch (m[2].toLowerCase()) {
    case "m":
      return n * 60 * 1000;
    case "h":
      return n * 60 * 60 * 1000;
    case "d":
      return n * 24 * 60 * 60 * 1000;
    default:
      return 24 * 60 * 60 * 1000;
  }
};

export const useTokenConsumption = (): UseTokenConsumptionResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const canQuery = canQueryScope(_resolution);

  const totalMs = parseScopeMs(scope.timeframe.from);
  const bucket = pickSnappedBucket(totalMs);
  const intervalSec = bucket.sec;

  const { data, isLoading, error } = useScopedDql<SeriesRecord>(
    canQuery ? buildTokenSeriesQuery(serviceIds, scope.timeframe, intervalSec) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<UseTokenConsumptionResult>(() => {
    const row = data?.records?.[0];
    // Each bucket value is a sum() of tokens — extrapolate every point.
    const arr = (row?.tokens ?? []).map((v) => {
      const n = toNum(v);
      return Number.isFinite(n) ? n * samplingRatio : 0;
    });
    const intervalMs = intervalSec * 1000;
    const blended = getPricing("claude-sonnet-4-6");
    const points: TokenSeriesPoint[] = arr.map((tokens, i) => {
      const halfIn = tokens / 2;
      const halfOut = tokens / 2;
      return {
        t: i * intervalMs,
        tokens,
        estCost: estimateCost(halfIn, halfOut, blended),
      };
    });

    const totalTokens = points.reduce((acc, p) => acc + p.tokens, 0);
    const totalCost = points.reduce((acc, p) => acc + p.estCost, 0);

    return {
      points,
      intervalMs,
      intervalLabel: bucket.label,
      totalTokens,
      totalCost,
      isLoading: servicesLoading || isLoading,
      error: error ?? undefined,
    };
  }, [
    data,
    isLoading,
    error,
    servicesLoading,
    intervalSec,
    samplingRatio,
    bucket.label,
  ]);
};
