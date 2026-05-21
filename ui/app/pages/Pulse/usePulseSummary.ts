import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import {
  extrapolate,
  extrapolateSeries,
  useSampling,
} from "../../scope/SamplingContext";
import { buildSummaryQuery, buildTokenSeriesQuery } from "./dataQueries";
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
  tokens?: number[] | null;
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
  /** Per-tile sparkline (first 4 tiles only). Length ≈ SPARK_TARGET_BUCKETS. */
  spark: {
    tokens: number[];
  };
  isLoading: boolean;
  error?: Error;
}

/**
 * Target bucket count for the sparkline series. The actual interval is
 * sized from the active timeframe so a 24h window gives ~5.5-minute
 * buckets, a 7d window gives ~67-minute buckets, etc. Clamped against a
 * 30-second floor below to keep Grail's `makeTimeseries` happy on very
 * short windows.
 */
const SPARK_TARGET_BUCKETS = 150;

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

  // Bucket interval scales with the active timeframe so sparklines stay
  // smooth at any scope without overshooting Grail's `makeTimeseries`
  // minimum interval.
  const sparkTotalMs = parseSparkScopeMs(scope.timeframe.from);
  const sparkIntervalSec = Math.max(
    30,
    Math.floor(sparkTotalMs / SPARK_TARGET_BUCKETS / 1000),
  );

  const spark = useScopedDql<SeriesRecord>(
    canQuery
      ? buildTokenSeriesQuery(serviceIds, scope.timeframe, sparkIntervalSec)
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
        tokens: Array.isArray(sparkRow?.tokens)
          ? extrapolateSeries(
              sparkRow.tokens.filter((v) => typeof v === "number"),
              samplingRatio,
            )
          : [],
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
