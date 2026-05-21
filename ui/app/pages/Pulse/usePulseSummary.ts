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
  buildSummaryQuery,
  buildSummarySparkSeriesQuery,
} from "./dataQueries";
import { estimateCost, getPricing } from "../../data/pricing";

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
    p95Ms: number[];
    errorRatePct: number[];
  };
  isLoading: boolean;
  error?: Error;
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
 * Cheap blended cost estimate: spend = avg(price) × tokens. We don't have a
 * per-row spend in the summary so we average the headline models. The
 * per-agent breakdown in useAgentCosts is the authoritative dollar figure;
 * this is only used for the tile-level "Spend" value.
 */
const BLENDED_PRICE_PER_MTOK = {
  input: getPricing("claude-sonnet-4-6").inputPerMTok,
  output: getPricing("claude-sonnet-4-6").outputPerMTok,
};

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

    const spend = estimateCost(inTok, outTok, {
      inputPerMTok: BLENDED_PRICE_PER_MTOK.input,
      outputPerMTok: BLENDED_PRICE_PER_MTOK.output,
      contextWindow: null,
      provider: "Blended",
      tier: "mid",
    });

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
      estimateCost(bucketTokens / 2, bucketTokens / 2, {
        inputPerMTok: BLENDED_PRICE_PER_MTOK.input,
        outputPerMTok: BLENDED_PRICE_PER_MTOK.output,
        contextWindow: null,
        provider: "Blended",
        tier: "mid",
      }),
    );
    const p95MsSeries = p95NsSeries.map((ns) =>
      ns > 0 ? ns / 1_000_000 : 0,
    );
    const errorRateSeries = requestsSeries.map((req, i) =>
      req > 0 ? (errorsSeries[i] / req) * 100 : 0,
    );

    return {
      tokens,
      requests,
      spend: tokens ? spend : null,
      costPerRequest,
      p95Ms: row?.p95_ms ?? null,
      errorRatePct: row?.error_rate_pct ?? null,
      models: row?.models ?? null,
      mcpServers: row?.mcp_servers ?? null,
      mcpTools: row?.mcp_tools ?? null,
      tokenEfficiencyPct: row?.token_efficiency_pct ?? null,
      spark: {
        tokens: tokensSeries,
        spend: spendSeries,
        p95Ms: p95MsSeries,
        errorRatePct: errorRateSeries,
      },
      isLoading:
        servicesLoading || summary.isLoading || spark.isLoading,
      error: summary.error ?? spark.error ?? undefined,
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
  ]);
};
