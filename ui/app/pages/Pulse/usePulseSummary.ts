import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
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
  /** Per-tile sparkline (first 4 tiles only). 24 points = 1h buckets over 24h. */
  spark: {
    tokens: number[];
  };
  isLoading: boolean;
  error?: Error;
}

const SPARK_BUCKET_SEC = 60 * 60; // 1h buckets

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
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const canQuery = canQueryScope(_resolution);

  const summary = useScopedDql<SummaryRecord>(
    canQuery ? buildSummaryQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  const spark = useScopedDql<SeriesRecord>(
    canQuery ? buildTokenSeriesQuery(serviceIds, scope.timeframe, SPARK_BUCKET_SEC) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<PulseSummary>(() => {
    const row = summary.data?.records?.[0];
    const sparkRow = spark.data?.records?.[0];
    const inTok = row?.input_tokens ?? 0;
    const outTok = row?.output_tokens ?? 0;
    const tokens = row?.total_tokens ?? null;
    const requests = row?.requests ?? null;

    const spend = estimateCost(inTok, outTok, {
      inputPerMTok: BLENDED_PRICE_PER_MTOK.input,
      outputPerMTok: BLENDED_PRICE_PER_MTOK.output,
      contextWindow: null,
      provider: "Blended",
      tier: "mid",
    });

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
        tokens: Array.isArray(sparkRow?.tokens) ? sparkRow.tokens.filter((v) => typeof v === "number") : [],
      },
      isLoading:
        servicesLoading || summary.isLoading || spark.isLoading,
      error: summary.error ?? spark.error ?? undefined,
    };
  }, [
    servicesLoading,
    summary.data,
    summary.error,
    summary.isLoading,
    spark.data,
    spark.error,
    spark.isLoading,
  ]);
};
