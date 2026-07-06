import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import {
  extrapolate,
  extrapolateSeries,
  useSampling,
} from "../../scope/SamplingContext";
import {
  buildMcpCountQuery,
  buildSummaryQuery,
  buildSummarySparkSeriesQuery,
} from "./dataQueries";
import { costOf } from "../../data/pricing";

interface SummaryRecord {
  requests?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  p95_ms?: number;
  error_rate_pct?: number;
  models?: number;
  mcp_servers?: number;
  mcp_tools?: number;
  token_efficiency_pct?: number;
}

interface SeriesRecord {
  tokens?: (number | null)[] | null;
  p95_ns?: (number | null)[] | null;
  errors?: (number | null)[] | null;
  requests?: (number | null)[] | null;
  timeframe?: { start?: string; end?: string };
}

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
}

interface McpCountRecord {
  mcp_servers?: number;
  mcp_tools?: number;
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

const formatIntervalLabel = (sec: number): string => {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
};

/**
 * Cheap blended cost estimate: spend = blended-rate × tokens. We don't have a
 * per-row spend in the summary, so cost flows through the cache-aware model at
 * the blended rate (costOf(..., null)). The per-agent breakdown in
 * useAgentCosts is the authoritative dollar figure; this is only the tile-level
 * "Spend" value.
 */

export const usePulseSummary = (): PulseSummary => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const canQuery = canQueryScope(_resolution);

  const summary = useScopedDql<SummaryRecord>(
    canQuery ? buildSummaryQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
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
    { enabled: canQuery, staleTime: 60_000 },
  );

  // MCP server/tool counts are a separate query because the main summary
  // filters on `gen_ai.provider.name` which excludes MCP-only spans.
  const mcpCounts = useScopedDql<McpCountRecord>(
    canQuery ? buildMcpCountQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<PulseSummary>(() => {
    const row = summary.data?.records?.[0];
    const sparkRow = spark.data?.records?.[0];
    // Counts and sums are sampled — extrapolate back to the unsampled
    // population. Ratios (error rate, token efficiency) and statistics
    // (percentiles, distinctCount) are sampling-invariant.
    const inTok = (row?.input_tokens ?? 0) * samplingRatio;
    const outTok = (row?.output_tokens ?? 0) * samplingRatio;
    const tokens = extrapolate(row?.total_tokens, samplingRatio);
    const requests = extrapolate(row?.requests, samplingRatio);

    const spend = costOf(inTok, outTok, null);

    // costPerRequest is invariant under sampling — spend and requests
    // are both scaled by samplingRatio, so the quotient cancels.
    const costPerRequest =
      requests && requests > 0 ? spend / requests : null;

    // Derive per-bucket spark series from the multi-series spark query.
    // tokens / errors / requests are count-or-sum aggregates (extrapolate
    // by samplingRatio); p95_ns / error-rate ratios are statistics
    // (sampling-invariant). Spend per bucket follows from the per-bucket
    // tokens via the same blended pricing as the headline.
    const toNumArr = (arr: unknown): number[] =>
      Array.isArray(arr)
        ? arr.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : 0))
        : [];
    const tokensSeries = extrapolateSeries(
      toNumArr(sparkRow?.tokens),
      samplingRatio,
    );
    const p95NsSeries = toNumArr(sparkRow?.p95_ns);
    const errorsSeries = toNumArr(sparkRow?.errors);
    const requestsSeries = toNumArr(sparkRow?.requests);

    const spendSeries = tokensSeries.map((bucketTokens) =>
      costOf(bucketTokens / 2, bucketTokens / 2, null),
    );
    const p95MsSeries = p95NsSeries.map((ns) =>
      ns > 0 ? ns / 1_000_000 : 0,
    );
    const errorRateSeries = requestsSeries.map((req, i) =>
      req > 0 ? (errorsSeries[i] / req) * 100 : 0,
    );
    // Cost per request per bucket. spendSeries is extrapolated (from
    // extrapolated tokens); requestsSeries is the raw sampled count, so scale
    // it by samplingRatio to keep the quotient sampling-invariant.
    const costPerReqSeries = spendSeries.map((bucketSpend, i) => {
      const reqs = requestsSeries[i] * samplingRatio;
      return reqs > 0 ? bucketSpend / reqs : 0;
    });

    // Per-bucket date+time labels for the sparkline cursor tooltip. The
    // last bucket lines up with "now"; earlier buckets step back by
    // intervalMs. Format compresses to HH:MM for short windows and
    // "MMM dd HH:MM" for multi-day windows.
    const len = Math.max(
      tokensSeries.length,
      p95NsSeries.length,
      errorsSeries.length,
      requestsSeries.length,
    );
    const intervalMs = sparkIntervalSec * 1000;
    const totalSpanMs = len * intervalMs;
    const multiDay = totalSpanMs >= 24 * 60 * 60 * 1000;
    const tsFmt = new Intl.DateTimeFormat(undefined, {
      ...(multiDay
        ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
        : { hour: "numeric", minute: "2-digit" }),
    });
    const nowMs = Date.now();
    const sparkLabels: string[] = [];
    for (let i = 0; i < len; i++) {
      const ts = nowMs - (len - 1 - i) * intervalMs;
      sparkLabels.push(tsFmt.format(new Date(ts)));
    }

    const mcpRow = mcpCounts.data?.records?.[0];
    return {
      tokens,
      requests,
      spend: tokens ? spend : null,
      costPerRequest,
      p95Ms: row?.p95_ms ?? null,
      errorRatePct: row?.error_rate_pct ?? null,
      models: row?.models ?? null,
      // MCP counts come from a dedicated query that doesn't filter on
      // gen_ai.provider.name. Fall back to the legacy summary value if
      // the dedicated query hasn't returned yet.
      mcpServers: mcpRow?.mcp_servers ?? row?.mcp_servers ?? null,
      mcpTools: mcpRow?.mcp_tools ?? row?.mcp_tools ?? null,
      tokenEfficiencyPct: row?.token_efficiency_pct ?? null,
      spark: {
        tokens: tokensSeries,
        spend: spendSeries,
        costPerReq: costPerReqSeries,
        p95Ms: p95MsSeries,
        errorRatePct: errorRateSeries,
        intervalSec: sparkIntervalSec,
        intervalLabel: formatIntervalLabel(sparkIntervalSec),
        labels: sparkLabels,
      },
      isLoading:
        servicesLoading ||
        summary.isLoading ||
        spark.isLoading ||
        mcpCounts.isLoading,
      error:
        summary.error ?? spark.error ?? mcpCounts.error ?? undefined,
    };
  }, [
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
  ]);
};
