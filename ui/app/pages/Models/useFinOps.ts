import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useSampling } from "../../scope/SamplingContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import {
  buildDailyTokensDayQuery,
  buildServiceCostBreakdownQuery,
} from "./finopsQueries";
import { costOf } from "../../data/pricing";
import { toNum } from "../../data/format";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

/** Days rendered in the daily cost bar (oldest → newest). */
const DAILY_DAYS = 7;

/**
 * Sampling floor for the per-day scans. A scope-filtered 24h window can still be
 * multiple TB at full fidelity and blow the platform execution-time limit (the
 * scan-limit selector doesn't help — the query times out before reaching it),
 * which is what left older days empty. Running at 1-in-100 and extrapolating the
 * token sums keeps every day populated; the toolbar ratio still wins if heavier.
 * Mirrors Pulse's useDailySpend.
 */
const DAILY_MIN_SAMPLING = 100;

interface DailyDayRecord {
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
}

interface ServiceCostRecord {
  service?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  requests?: number;
}

export interface DailyModelSeries {
  model: string;
  values: number[];
}

export interface DailyCostSummary {
  /** Day labels in display order (oldest → newest). */
  dayLabels: string[];
  /** One series per model. values.length === dayLabels.length. */
  series: DailyModelSeries[];
  totals: number[];
}

/** One model's contribution to a service's spend (for the detail modal). */
export interface ServiceModelBreakdown {
  model: string;
  tokens: number;
  cost: number;
  requests: number;
}

export interface ServiceCost {
  service: string;
  tokens: number;
  cost: number;
  costPerMTok: number;
  /** Total LLM calls for this service over the timeframe. */
  requests: number;
  /** Cost ÷ requests — unit economics, $ per LLM call. */
  costPerRequest: number;
  /** (input + output tokens) ÷ requests — prompt-bloat indicator. */
  tokensPerRequest: number;
  topModel: string | null;
  modelCount: number;
  /** Per-model spend breakdown, sorted by cost desc. */
  models: ServiceModelBreakdown[];
}

export interface FinOpsData {
  /** Daily cost per model over the last 7d. */
  daily: DailyCostSummary;
  /** Per-service cost totals (current scope timeframe). */
  services: ServiceCost[];
  /** Cost over the last 24h. */
  spend24h: number;
  /** Cost over the last 7d. */
  spend7d: number;
  /** Linear projection to 30d (7d × 30/7). */
  projected30d: number;
  /** Top service's share of total tokens (current scope timeframe). */
  concentrationPct: number;
  /** Blended $/1M tokens across the fleet. */
  costPerMTok: number;
  /** Estimated savings if expensive-model traffic shifted to its cheaper peer. */
  possibleSavings: number;
  isLoading: boolean;
  error?: Error;
}

const dayLabel = (offsetFromOldest: number, totalDays: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - (totalDays - 1 - offsetFromOldest));
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  });
};

export const useFinOps = (): FinOpsData => {
  const { scope } = useScope();
  const { filters } = useGlobalFilters();
  const { samplingRatio } = useSampling();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);

  // Per-day scans run at a sampling floor so each 24h window completes within
  // the platform execution-time limit; the toolbar ratio wins if it's heavier.
  const dailyRatio = Math.max(samplingRatio, DAILY_MIN_SAMPLING);
  const dayQuery = (offset: number): string =>
    canQuery ? buildDailyTokensDayQuery(resolution.serviceIds, offset) : "";
  const dailyOpts = {
    enabled: canQuery,
    staleTime: 5 * 60_000,
    samplingRatioOverride: dailyRatio,
  } as const;

  // Seven independent per-day scans (unrolled — React requires fixed hook order).
  // d0 = most recent 24h … d6 = six days ago.
  const d0 = useScopedDql<DailyDayRecord>(dayQuery(0), dailyOpts);
  const d1 = useScopedDql<DailyDayRecord>(dayQuery(1), dailyOpts);
  const d2 = useScopedDql<DailyDayRecord>(dayQuery(2), dailyOpts);
  const d3 = useScopedDql<DailyDayRecord>(dayQuery(3), dailyOpts);
  const d4 = useScopedDql<DailyDayRecord>(dayQuery(4), dailyOpts);
  const d5 = useScopedDql<DailyDayRecord>(dayQuery(5), dailyOpts);
  const d6 = useScopedDql<DailyDayRecord>(dayQuery(6), dailyOpts);
  // Indexed by day offset (0 = most recent).
  const dailyResults = [d0, d1, d2, d3, d4, d5, d6];

  const serviceResult = useScopedDql<ServiceCostRecord>(
    canQuery
      ? buildServiceCostBreakdownQuery(resolution.serviceIds, scope.timeframe, filters)
      : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<FinOpsData>(() => {
    // ---- Daily cost timeseries (one scan per day, oldest → newest) ----
    const dayCount = DAILY_DAYS;
    // model → per-day cost array, position 0 = oldest, last = most recent 24h.
    const byModelDay = new Map<string, number[]>();
    for (let offset = 0; offset < DAILY_DAYS; offset++) {
      const pos = DAILY_DAYS - 1 - offset; // offset 0 (newest) → last column
      for (const r of dailyResults[offset].data?.records ?? []) {
        if (!r.model) continue;
        // Extrapolate the floored-sample token sums back to the full population
        // before costing (sum-aggregates extrapolate cleanly).
        const inTok = num(r.input_tokens) * dailyRatio;
        const outTok = num(r.output_tokens) * dailyRatio;
        let arr = byModelDay.get(r.model);
        if (!arr) {
          arr = new Array<number>(DAILY_DAYS).fill(0);
          byModelDay.set(r.model, arr);
        }
        arr[pos] += costOf(inTok, outTok, r.model);
      }
    }
    const series: DailyModelSeries[] = Array.from(byModelDay.entries()).map(
      ([model, values]) => ({ model, values }),
    );
    // Top 6 by total cost; aggregate the rest into "Other".
    series.sort(
      (a, b) =>
        b.values.reduce((acc, v) => acc + v, 0) -
        a.values.reduce((acc, v) => acc + v, 0),
    );
    const TOP_N = 6;
    let trimmedSeries: DailyModelSeries[];
    if (series.length > TOP_N) {
      const head = series.slice(0, TOP_N);
      const tail = series.slice(TOP_N);
      const other: DailyModelSeries = {
        model: "Other",
        values: Array.from({ length: dayCount }, (_, i) =>
          tail.reduce((acc, s) => acc + (s.values[i] ?? 0), 0),
        ),
      };
      trimmedSeries = [...head, other];
    } else {
      trimmedSeries = series;
    }
    const dayLabels = Array.from({ length: dayCount }, (_, i) =>
      dayLabel(i, dayCount),
    );
    const totals = Array.from({ length: dayCount }, (_, i) =>
      trimmedSeries.reduce((acc, s) => acc + (s.values[i] ?? 0), 0),
    );

    const spend7d = totals.reduce((acc, v) => acc + v, 0);
    const spend24h = totals[totals.length - 1] ?? 0;
    const projected30d = spend7d > 0 ? (spend7d / 7) * 30 : 0;

    // ---- Per-service rollup ----
    const byService = new Map<
      string,
      {
        tokens: number;
        cost: number;
        requests: number;
        models: Map<string, ServiceModelBreakdown>;
        topModel: string;
        topModelTokens: number;
      }
    >();
    for (const r of serviceResult.data?.records ?? []) {
      if (!r.service || !r.model) continue;
      const inputTokens = num(r.input_tokens);
      const outputTokens = num(r.output_tokens);
      const tokens = inputTokens + outputTokens;
      const cost = costOf(inputTokens, outputTokens, r.model);
      const requests = num(r.requests);
      const entry =
        byService.get(r.service) ?? {
          tokens: 0,
          cost: 0,
          requests: 0,
          models: new Map<string, ServiceModelBreakdown>(),
          topModel: r.model,
          topModelTokens: 0,
        };
      entry.tokens += tokens;
      entry.cost += cost;
      entry.requests += requests;
      // Accumulate this model's contribution to the service (a model can appear
      // more than once across raw-name variants in the same service).
      const mb = entry.models.get(r.model) ?? {
        model: r.model,
        tokens: 0,
        cost: 0,
        requests: 0,
      };
      mb.tokens += tokens;
      mb.cost += cost;
      mb.requests += requests;
      entry.models.set(r.model, mb);
      if (tokens > entry.topModelTokens) {
        entry.topModel = r.model;
        entry.topModelTokens = tokens;
      }
      byService.set(r.service, entry);
    }
    const services: ServiceCost[] = Array.from(byService.entries())
      .map(([service, entry]) => ({
        service,
        tokens: entry.tokens,
        cost: entry.cost,
        costPerMTok:
          entry.tokens > 0 ? (entry.cost / entry.tokens) * 1_000_000 : 0,
        requests: entry.requests,
        costPerRequest: entry.requests > 0 ? entry.cost / entry.requests : 0,
        tokensPerRequest: entry.requests > 0 ? entry.tokens / entry.requests : 0,
        topModel: entry.topModel,
        modelCount: entry.models.size,
        models: Array.from(entry.models.values()).sort(
          (a, b) => b.cost - a.cost,
        ),
      }))
      .sort((a, b) => b.cost - a.cost);

    const totalTokens = services.reduce((acc, s) => acc + s.tokens, 0);
    const totalCost = services.reduce((acc, s) => acc + s.cost, 0);
    const topService = services[0];
    const concentrationPct =
      topService && totalTokens > 0
        ? (topService.tokens / totalTokens) * 100
        : 0;
    const costPerMTok =
      totalTokens > 0 ? (totalCost / totalTokens) * 1_000_000 : 0;

    // ---- Possible savings ----
    // For each service: if its blended $/MTok is more than 3× the cheapest
    // service's $/MTok, assume it could halve its blended rate. Sum those
    // half-savings across services as a rough "Possible savings" headline.
    const pricedServices = services.filter((s) => s.costPerMTok > 0);
    let possibleSavings = 0;
    if (pricedServices.length >= 2) {
      const cheapest = pricedServices.reduce((best, s) =>
        s.costPerMTok < best.costPerMTok ? s : best,
      );
      for (const svc of pricedServices) {
        if (svc.costPerMTok > cheapest.costPerMTok * 3) {
          const targetCost = (svc.tokens / 1_000_000) * cheapest.costPerMTok * 2;
          possibleSavings += Math.max(0, svc.cost - targetCost);
        }
      }
    }

    return {
      daily: { dayLabels, series: trimmedSeries, totals },
      services,
      spend24h,
      spend7d,
      projected30d,
      concentrationPct,
      costPerMTok,
      possibleSavings,
      isLoading:
        resolution.isLoading ||
        dailyResults.some((r) => r.isLoading) ||
        serviceResult.isLoading,
      error:
        dailyResults.find((r) => r.error)?.error ??
        serviceResult.error ??
        undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    d0.data,
    d1.data,
    d2.data,
    d3.data,
    d4.data,
    d5.data,
    d6.data,
    dailyRatio,
    serviceResult.data,
    serviceResult.isLoading,
    serviceResult.error,
    resolution.isLoading,
    filters,
  ]);
};
