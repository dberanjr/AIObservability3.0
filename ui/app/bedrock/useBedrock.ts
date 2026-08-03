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
import { useTweaks } from "../tweaks/TweaksContext";
import { toNum } from "../data/format";
import type { Timeframe } from "../scope/types";
import type { BedrockScope } from "./types";
import { buildBedrockOverviewQuery, buildBedrockDailyCostQuery, buildBedrockAvailableQuery, buildAgentSessionsQuery, buildAccountModelQuery, buildBedrockFacetsQuery, buildBedrockErrorRateSparkQuery, buildAgentSessionsSparkQuery } from "./queries";
import { pickChartIntervalSec } from "../scope/chartInterval";
import { buildBedrockPerfByModelQuery, buildBedrockTpmQuery } from "./metricQueries";
import { parseOverview, parseAgentSessions, parsePerfByModel, parseAccountCost, parseFacets, aggregatePerfSeries, type OverviewTotals, type AgentSessionRow, type PerfByModelRow, type AccountCostRow, type BedrockFacets } from "./parse";
import { foldDailyCost, foldErrorRateSpark, foldSessionsSpark, type BedrockDailyCostPoint } from "./series";
import type { BedrockCostSummary } from "./cost";
import {
  DEMO_OVERVIEW_TOTALS,
  DEMO_DAILY_COST,
  DEMO_COST_SUMMARY,
  DEMO_COST_SPARK,
  DEMO_ERROR_RATE_SPARK,
  DEMO_SESSIONS_SPARK,
  DEMO_ACCOUNT_COST_ROWS,
  DEMO_AGENT_SESSION_ROWS,
  DEMO_PERF_ROWS,
  DEMO_PERF_SERIES,
  DEMO_TPM_PEAK_PCT,
  DEMO_FACETS,
} from "./demoData";

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

/**
 * Cheap existence probe: any bedrock log group row in the CALLER-SUPPLIED
 * timeframe (not a hardcoded rolling window — a fixed lookback would disagree
 * with every other query on the page whenever the user picks a different
 * range, producing a false "no telemetry" result over a window that's
 * actually populated). Takes only a `Timeframe` (not the full `BedrockScope`)
 * since `BedrockPage` uses this result to DECIDE `scope.showExample` in the
 * first place — reading it here would be circular. When the global Demo Mode
 * tweak is already on, skips the query entirely (its result is irrelevant)
 * and reports available so callers never bother probing real telemetry they
 * don't care about.
 */
export const useBedrockAvailable = (
  timeframe: Timeframe,
): { available: boolean; isLoading: boolean } => {
  const { pageConfig } = useTweaks();
  const res = useScopedDql<ResultRecord>(buildBedrockAvailableQuery(timeframe), {
    ...IGNORE,
    enabled: !pageConfig.demoMode,
  });
  if (pageConfig.demoMode) return { available: true, isLoading: false };
  return { available: (res.data?.records?.length ?? 0) > 0, isLoading: res.isLoading };
};

export const useBedrockOverview = (
  scope: BedrockScope,
): { totals: OverviewTotals; isLoading: boolean; error?: Error } => {
  const res = useScopedDql<ResultRecord>(buildBedrockOverviewQuery(scope), {
    ...IGNORE,
    enabled: !scope.showExample,
  });
  return useMemo(() => {
    if (scope.showExample) {
      return { totals: DEMO_OVERVIEW_TOTALS, isLoading: false, error: undefined };
    }
    return {
      totals: parseOverview(res.data?.records ?? []),
      isLoading: res.isLoading,
      error: res.error ?? undefined,
    };
  }, [scope.showExample, res.data, res.isLoading, res.error]);
};

/** Daily per-model cost (cache-aware, with the no-cache ghost) for the cost
 *  trend chart. The bucket fold is pure logic in `series.ts` — see its tests. */
export const useBedrockCost = (
  scope: BedrockScope,
): { daily: BedrockDailyCostPoint[]; summary: BedrockCostSummary; isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(buildBedrockDailyCostQuery(scope), {
    ...IGNORE,
    enabled: !scope.showExample,
  });
  return useMemo(() => {
    if (scope.showExample) {
      return { daily: DEMO_DAILY_COST, summary: DEMO_COST_SUMMARY, isLoading: false };
    }
    const { daily, summary } = foldDailyCost(res.data?.records ?? []);
    return { daily, summary, isLoading: res.isLoading };
  }, [scope.showExample, res.data, res.isLoading]);
};

/** Finer-grained cost series for the Total Spend hero/KPI sparklines only —
 *  same fold as {@link useBedrockCost} but at {@link pickChartIntervalSec} (the
 *  SAME granularity ladder every other KPI-row sparkline on this page uses,
 *  so the row reads as one consistent chart) rather than the coarser
 *  {@link bedrockCostIntervalSec} the daily bar chart uses. Returns just the
 *  per-bucket actual spend + day labels. */
export const useBedrockCostSpark = (
  scope: BedrockScope,
): { values: number[]; labels: string[]; isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(
    buildBedrockDailyCostQuery(scope, pickChartIntervalSec(scope.timeframe.from)),
    { ...IGNORE, enabled: !scope.showExample },
  );
  return useMemo(() => {
    if (scope.showExample) {
      return { values: DEMO_COST_SPARK.values, labels: DEMO_COST_SPARK.labels, isLoading: false };
    }
    const { daily } = foldDailyCost(res.data?.records ?? []);
    return {
      values: daily.map((d) => d.actual),
      labels: daily.map((d) => d.day),
      isLoading: res.isLoading,
    };
  }, [scope.showExample, res.data, res.isLoading]);
};

/** Bucketed error-rate series for the "Error rate" KPI tile's sparkline — a
 *  ratio of two equally-extrapolated sums (see `foldErrorRateSpark`), so no
 *  sampling-ratio scaling is applied here either. */
export const useBedrockErrorRateSpark = (
  scope: BedrockScope,
): { values: number[]; labels: string[]; isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(buildBedrockErrorRateSparkQuery(scope), {
    ...IGNORE,
    enabled: !scope.showExample,
  });
  return useMemo(() => {
    if (scope.showExample) {
      return { values: DEMO_ERROR_RATE_SPARK.values, labels: DEMO_ERROR_RATE_SPARK.labels, isLoading: false };
    }
    const { values, labels } = foldErrorRateSpark(res.data?.records ?? []);
    return { values, labels, isLoading: res.isLoading };
  }, [scope.showExample, res.data, res.isLoading]);
};

/** Bucketed distinct-session-count series for the "Sessions" KPI tile's
 *  sparkline. Deliberately NOT extrapolated by the sampling ratio — same rule
 *  as the exact headline Sessions count in `useBedrockOverview` (a
 *  countDistinct would overcount, not correct, if scaled). */
export const useAgentSessionsSpark = (
  scope: BedrockScope,
): { values: number[]; labels: string[]; isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(buildAgentSessionsSparkQuery(scope), {
    ...IGNORE,
    enabled: !scope.showExample,
  });
  return useMemo(() => {
    if (scope.showExample) {
      return { values: DEMO_SESSIONS_SPARK.values, labels: DEMO_SESSIONS_SPARK.labels, isLoading: false };
    }
    const { values, labels } = foldSessionsSpark(res.data?.records ?? []);
    return { values, labels, isLoading: res.isLoading };
  }, [scope.showExample, res.data, res.isLoading]);
};

/** Per-account cost (D4 by-account breakdown). `buildAccountModelQuery`
 *  returns one scalar `summarize` row per (account, modelId) pair — no time
 *  axis — so parsing is a flat fold, not the bucketed `foldDailyCost` the
 *  daily-cost hook uses. */
export const useBedrockAccountCost = (
  scope: BedrockScope,
): { rows: AccountCostRow[]; isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(buildAccountModelQuery(scope), {
    ...IGNORE,
    enabled: !scope.showExample,
  });
  return useMemo(() => {
    if (scope.showExample) return { rows: DEMO_ACCOUNT_COST_ROWS, isLoading: false };
    return {
      rows: parseAccountCost((res.data?.records ?? [])),
      isLoading: res.isLoading,
    };
  }, [scope.showExample, res.data, res.isLoading]);
};

export const useAgentSessions = (
  scope: BedrockScope,
): { rows: AgentSessionRow[]; isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(buildAgentSessionsQuery(scope), {
    ...IGNORE,
    enabled: !scope.showExample,
  });
  return useMemo(() => {
    if (scope.showExample) return { rows: DEMO_AGENT_SESSION_ROWS, isLoading: false };
    return {
      rows: parseAgentSessions((res.data?.records ?? [])),
      isLoading: res.isLoading,
    };
  }, [scope.showExample, res.data, res.isLoading]);
};

export const useBedrockPerf = (
  scope: BedrockScope,
): {
  rows: PerfByModelRow[];
  tpmPeakPct: number;
  series: ReturnType<typeof aggregatePerfSeries>;
  isLoading: boolean;
} => {
  const perf = useScopedDql<ResultRecord>(buildBedrockPerfByModelQuery(scope.timeframe), {
    ...IGNORE,
    enabled: !scope.showExample,
  });
  const tpm = useScopedDql<ResultRecord>(buildBedrockTpmQuery(scope.timeframe), {
    ...IGNORE,
    enabled: !scope.showExample,
  });
  return useMemo(() => {
    if (scope.showExample) {
      return { rows: DEMO_PERF_ROWS, tpmPeakPct: DEMO_TPM_PEAK_PCT, series: DEMO_PERF_SERIES, isLoading: false };
    }
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
  }, [scope.showExample, perf.data, perf.isLoading, tpm.data, tpm.isLoading]);
};

/**
 * Distinct accounts + models for the D6 scope-selector option lists.
 * Deliberately takes only `timeframe` (not the full `BedrockScope`) and
 * routes through `buildBedrockFacetsQuery`, which never applies the current
 * account/model selection — see that query's doc comment for why a
 * self-scoped facets query would make each picker prune its own options.
 * `showExample` is a separate parameter (rather than living on a scope
 * object, since this hook doesn't take one) so the Account/Model pickers
 * stay populated and clickable in demo mode too, not just the tiles.
 */
export const useBedrockFacets = (
  timeframe: Timeframe,
  showExample = false,
): BedrockFacets & { isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(buildBedrockFacetsQuery(timeframe), {
    ...IGNORE,
    enabled: !showExample,
  });
  return useMemo(() => {
    if (showExample) return { ...DEMO_FACETS, isLoading: false };
    return {
      ...parseFacets((res.data?.records ?? [])),
      isLoading: res.isLoading,
    };
  }, [showExample, res.data, res.isLoading]);
};

export { useScope }; // re-export for page convenience
