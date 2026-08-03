import { useCallback, useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { useSampling } from "../../scope/SamplingContext";
import {
  buildMcpCountQuery,
  buildSummaryQuery,
  buildSummarySparkSeriesQuery,
} from "./dataQueries";
import {
  computePulseSummaryCore,
  type SummaryRecord,
  type SeriesRecord,
  type McpCountRecord,
} from "./parse";
import { DEMO_PULSE_SUMMARY } from "./demoData";

export type { SummaryRecord, SeriesRecord, McpCountRecord };

export interface PulseSummary {
  tokens: number | null;
  requests: number | null;
  spend: number | null;
  costPerRequest: number | null;
  p95Ms: number | null;
  errorRatePct: number | null;
  models: number | null;
  mcpServers: number | null;
  mcpTools: number | null;
  tokenEfficiencyPct: number | null;
  /**
   * Per-tile sparkline series. Each is bucketed at the same interval
   * (~150 buckets across the active timeframe). All four are derived from
   * a single DQL call so the buckets line up exactly.
   */
  spark: {
    tokens: number[];
    spend: number[];
    /** Blended cost per request per bucket (sampling-invariant). */
    costPerReq: number[];
    p95Ms: number[];
    errorRatePct: number[];
    /** Bucket interval in seconds — same for every series above. */
    intervalSec: number;
    /** Human label for that interval ("1m" / "5m" / "1h" etc.). */
    intervalLabel: string;
    /** Per-bucket date+time string, e.g. "14:30" or "Jan 14 14:30". */
    labels: string[];
  };
  isLoading: boolean;
  error?: Error;
  /** Re-run every underlying summary query (bound to the useDql refetches). */
  refetch: () => void;
}

/**
 * Sparkline bucket interval per timeframe. Tiered so the chart density
 * lines up with what the user specified for 24h / 7d / 30d, with smooth
 * coverage either side.
 *
 *   <= 30m   → 30s   (~60 buckets)
 *   <= 1h    → 60s   (~60 buckets)
 *   <= 6h    → 120s  (~180 buckets)
 *   <= 24h   → 300s  (~288 buckets — user spec: 5 min)
 *   <= 7d    → 3600s (~168 buckets — user spec: 60 min)
 *   <= 30d   → 21600s (~120 buckets — user spec: 6 hours)
 *   else     → 1 day
 */
const parseSparkScopeMs = (from: string): number => {
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

const pickSparkIntervalSec = (totalMs: number): number => {
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (totalMs <= 30 * minute) return 30;
  if (totalMs <= 1 * hour) return 60;
  if (totalMs <= 6 * hour) return 120;
  if (totalMs <= 1 * day) return 300; // 5 min
  if (totalMs <= 7 * day) return 3600; // 60 min
  if (totalMs <= 30 * day) return 21600; // 6 hours
  return 86400; // 1 day
};

/**
 * Cheap blended cost estimate: spend = blended-rate × tokens. We don't have a
 * per-row spend in the summary, so cost flows through the cache-aware model at
 * the blended rate (costOf(..., null)). The per-agent breakdown in
 * useAgentCosts is the authoritative dollar figure; this is only the tile-level
 * "Spend" value. The fold itself (`computePulseSummaryCore`) lives in
 * `./parse`, shared with `demoData.ts`'s `DEMO_PULSE_SUMMARY`.
 */

/**
 * `showExample` (default false, mirrors useGuardrails.ts) renders the Demo
 * Mode dataset instead of querying Grail — used by the Summary page when the
 * global Demo Mode Tweak is on or no AI telemetry exists at all. Pulse itself
 * never passes it, so its behavior is unchanged.
 */
export const usePulseSummary = (showExample = false): PulseSummary => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const canQuery = canQueryScope(_resolution);

  const summary = useScopedDql<SummaryRecord>(
    canQuery ? buildSummaryQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  // Bucket interval picked from a tiered map (24h → 5min, 7d → 60min,
  // 30d → 6h, with sensible defaults either side) so sparklines stay
  // smooth at any scope.
  const sparkTotalMs = parseSparkScopeMs(scope.timeframe.from);
  const sparkIntervalSec = pickSparkIntervalSec(sparkTotalMs);

  const spark = useScopedDql<SeriesRecord>(
    canQuery
      ? buildSummarySparkSeriesQuery(
          serviceIds,
          scope.timeframe,
          sparkIntervalSec,
        )
      : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  // MCP server/tool counts are a separate query because the main summary
  // filters on `gen_ai.provider.name` which excludes MCP-only spans.
  const mcpCounts = useScopedDql<McpCountRecord>(
    canQuery ? buildMcpCountQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  const refetch = useCallback(() => {
    void summary.refetch();
    void spark.refetch();
    void mcpCounts.refetch();
    // react-query refetch identities are stable; depending on the whole result
    // objects would rebuild this callback every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.refetch, spark.refetch, mcpCounts.refetch]);

  return useMemo<PulseSummary>(() => {
    if (showExample) {
      return { ...DEMO_PULSE_SUMMARY, isLoading: false, error: undefined, refetch };
    }
    const row = summary.data?.records?.[0];
    const sparkRow = spark.data?.records?.[0];
    const mcpRow = mcpCounts.data?.records?.[0];
    const core = computePulseSummaryCore(
      row,
      sparkRow,
      mcpRow,
      samplingRatio,
      sparkIntervalSec,
    );
    return {
      ...core,
      isLoading:
        servicesLoading ||
        summary.isLoading ||
        spark.isLoading ||
        mcpCounts.isLoading,
      error: summary.error ?? spark.error ?? mcpCounts.error ?? undefined,
      refetch,
    };
  }, [
    showExample,
    samplingRatio,
    servicesLoading,
    summary.data,
    summary.error,
    summary.isLoading,
    spark.data,
    spark.error,
    spark.isLoading,
    mcpCounts.data,
    mcpCounts.error,
    mcpCounts.isLoading,
    sparkIntervalSec,
    refetch,
  ]);
};
