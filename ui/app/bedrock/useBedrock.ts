/**
 * Bedrock data hooks: an existence probe (used to gate the Bedrock nav/page)
 * and the overview totals hook for the top-of-page summary card.
 *
 * Both queries are log queries with no `gen_ai.*` span attributes, so they
 * bypass the span-only injectors (global filter, bucket-filter tweak,
 * segments) via the three `ignore*` flags — mirrors the pattern in
 * useGuardrails.ts, whose queries are metric timeseries for the same reason.
 */

import { useMemo } from "react";
import type { ResultRecord } from "@dynatrace-sdk/client-query";
import { useScopedDql } from "../scope/useScopedDql";
import { useScope } from "../scope/ScopeContext";
import { toNum } from "../data/format";
import type { Timeframe } from "../scope/types";
import type { BedrockScope } from "./types";
import { buildBedrockOverviewQuery, buildBedrockDailyCostQuery, buildAgentSessionsQuery, buildAccountModelQuery, buildBedrockFacetsQuery, bedrockSparkIntervalSec } from "./queries";
import { buildBedrockPerfByModelQuery, buildBedrockTpmQuery } from "./metricQueries";
import { parseOverview, parseAgentSessions, parsePerfByModel, parseAccountCost, parseFacets, aggregatePerfSeries, type OverviewTotals, type AgentSessionRow, type PerfByModelRow, type AccountCostRow, type BedrockFacets } from "./parse";
import { foldDailyCost, type BedrockDailyCostPoint } from "./series";
import type { BedrockCostSummary } from "./cost";

// samplingRatioOverride:1 forces FULL FIDELITY on the log-based cost/usage
// queries so Total Spend, tokens, and invocation counts are exact and immune to
// the toolbar sampling selector (sampled logs are never extrapolated → cost would
// undercount). No-op for the metric `timeseries` queries (nothing to sample).
const IGNORE = {
  ignoreGlobalFilter: true,
  ignoreBucketFilter: true,
  ignoreSegments: true,
  samplingRatioOverride: 1,
  staleTime: 60_000,
} as const;

/** Cheap existence probe: any bedrock log group in the last 24h. */
export const useBedrockAvailable = (): { available: boolean; isLoading: boolean } => {
  const q = `fetch logs, from: now()-24h\n| filter contains(dt.da.aws.log_group, "bedrock")\n| limit 1\n| fields timestamp`;
  const res = useScopedDql<ResultRecord>(q, IGNORE);
  return { available: (res.data?.records?.length ?? 0) > 0, isLoading: res.isLoading };
};

export const useBedrockOverview = (
  scope: BedrockScope,
): { totals: OverviewTotals; isLoading: boolean; error?: Error } => {
  const res = useScopedDql<ResultRecord>(buildBedrockOverviewQuery(scope), IGNORE);
  return useMemo(
    () => ({
      totals: parseOverview(res.data?.records ?? []),
      isLoading: res.isLoading,
      error: res.error ?? undefined,
    }),
    [res.data, res.isLoading, res.error],
  );
};

/** Daily per-model cost (cache-aware, with the no-cache ghost) for the cost
 *  trend chart. The bucket fold is pure logic in `series.ts` — see its tests. */
export const useBedrockCost = (
  scope: BedrockScope,
): { daily: BedrockDailyCostPoint[]; summary: BedrockCostSummary; isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(buildBedrockDailyCostQuery(scope), IGNORE);
  return useMemo(() => {
    const { daily, summary } = foldDailyCost(res.data?.records ?? []);
    return { daily, summary, isLoading: res.isLoading };
  }, [res.data, res.isLoading]);
};

/** Finer-grained cost series for the Total Spend hero sparkline only — same
 *  fold as {@link useBedrockCost} but at {@link bedrockSparkIntervalSec} so the
 *  spark reads as a smooth trend, independent of the (coarser, daily) cost bar
 *  chart. Returns just the per-bucket actual spend + day labels. */
export const useBedrockCostSpark = (
  scope: BedrockScope,
): { values: number[]; labels: string[]; isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(
    buildBedrockDailyCostQuery(scope, bedrockSparkIntervalSec(scope.timeframe.from)),
    IGNORE,
  );
  return useMemo(() => {
    const { daily } = foldDailyCost(res.data?.records ?? []);
    return {
      values: daily.map((d) => d.actual),
      labels: daily.map((d) => d.day),
      isLoading: res.isLoading,
    };
  }, [res.data, res.isLoading]);
};

/** Per-account cost (D4 by-account breakdown). `buildAccountModelQuery`
 *  returns one scalar `summarize` row per (account, modelId) pair — no time
 *  axis — so parsing is a flat fold, not the bucketed `foldDailyCost` the
 *  daily-cost hook uses. */
export const useBedrockAccountCost = (
  scope: BedrockScope,
): { rows: AccountCostRow[]; isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(buildAccountModelQuery(scope), IGNORE);
  return useMemo(
    () => ({
      rows: parseAccountCost((res.data?.records ?? []) as Record<string, unknown>[]),
      isLoading: res.isLoading,
    }),
    [res.data, res.isLoading],
  );
};

export const useAgentSessions = (
  scope: BedrockScope,
): { rows: AgentSessionRow[]; isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(buildAgentSessionsQuery(scope), IGNORE);
  return useMemo(
    () => ({ rows: parseAgentSessions((res.data?.records ?? []) as Record<string, unknown>[]), isLoading: res.isLoading }),
    [res.data, res.isLoading],
  );
};

export const useBedrockPerf = (
  scope: BedrockScope,
): {
  rows: PerfByModelRow[];
  tpmPeakPct: number;
  series: ReturnType<typeof aggregatePerfSeries>;
  isLoading: boolean;
} => {
  const perf = useScopedDql<ResultRecord>(buildBedrockPerfByModelQuery(scope.timeframe), IGNORE);
  const tpm = useScopedDql<ResultRecord>(buildBedrockTpmQuery(scope.timeframe), IGNORE);
  return useMemo(() => {
    const perfRecords = (perf.data?.records ?? []) as Record<string, unknown>[];
    const tpmRecords = (tpm.data?.records ?? []) as Record<string, unknown>[];
    const rows = parsePerfByModel(perfRecords);
    const tpmVals = tpmRecords
      .flatMap((r) => (Array.isArray(r.tpm) ? (r.tpm as unknown[]) : []))
      .map((x) => toNum(x))
      .filter((n) => Number.isFinite(n));
    return {
      rows,
      tpmPeakPct: tpmVals.length ? Math.max(...tpmVals) : 0,
      series: aggregatePerfSeries(perfRecords, tpmRecords),
      isLoading: perf.isLoading || tpm.isLoading,
    };
  }, [perf.data, perf.isLoading, tpm.data, tpm.isLoading]);
};

/**
 * Distinct accounts + models for the D6 scope-selector option lists.
 * Deliberately takes only `timeframe` (not the full `BedrockScope`) and
 * routes through `buildBedrockFacetsQuery`, which never applies the current
 * account/model selection — see that query's doc comment for why a
 * self-scoped facets query would make each picker prune its own options.
 */
export const useBedrockFacets = (timeframe: Timeframe): BedrockFacets & { isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(buildBedrockFacetsQuery(timeframe), IGNORE);
  return useMemo(
    () => ({
      ...parseFacets((res.data?.records ?? []) as Record<string, unknown>[]),
      isLoading: res.isLoading,
    }),
    [res.data, res.isLoading],
  );
};

export { useScope }; // re-export for page convenience
