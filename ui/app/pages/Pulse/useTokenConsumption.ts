import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { useSampling } from "../../scope/SamplingContext";
import { parseScopeMs, pickChartBucket } from "../../scope/chartInterval";
import { buildTokenSeriesQuery } from "./dataQueries";
import { costOf } from "../../data/pricing";
import { toNum } from "../../data/format";
import { DEMO_TOKEN_SERIES_ROW } from "./demoData";

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
 * `showExample` (default false, mirrors useGuardrails.ts) renders the Demo
 * Mode dataset instead of querying Grail — set by Pulse's
 * TokenConsumptionChart when Demo Mode (or the app-wide "no AI telemetry yet"
 * fallback) is active. This hook has no other caller, so the default only
 * matters for tests.
 */
export const useTokenConsumption = (showExample = false): UseTokenConsumptionResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const canQuery = canQueryScope(_resolution);

  const totalMs = parseScopeMs(scope.timeframe.from);
  const bucket = pickChartBucket(totalMs);
  const intervalSec = bucket.sec;

  const { data, isLoading, error } = useScopedDql<SeriesRecord>(
    canQuery ? buildTokenSeriesQuery(serviceIds, scope.timeframe, intervalSec) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  return useMemo<UseTokenConsumptionResult>(() => {
    const row = showExample ? DEMO_TOKEN_SERIES_ROW : data?.records?.[0];
    // Each bucket value is a sum() of tokens — extrapolate every point. Demo
    // fixture values are already "real" (unsampled), so skip extrapolation.
    const effRatio = showExample ? 1 : samplingRatio;
    const arr = (row?.tokens ?? []).map((v) => {
      const n = toNum(v);
      return Number.isFinite(n) ? n * effRatio : 0;
    });
    const intervalMs = intervalSec * 1000;
    const points: TokenSeriesPoint[] = arr.map((tokens, i) => {
      const halfIn = tokens / 2;
      const halfOut = tokens / 2;
      return {
        t: i * intervalMs,
        tokens,
        // Fleet-aggregate bucket: price at the blended rate (model: null).
        estCost: costOf(halfIn, halfOut, null),
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
      isLoading: showExample ? false : servicesLoading || isLoading,
      error: showExample ? undefined : (error ?? undefined),
    };
  }, [
    showExample,
    data,
    isLoading,
    error,
    servicesLoading,
    intervalSec,
    samplingRatio,
    bucket.label,
  ]);
};
