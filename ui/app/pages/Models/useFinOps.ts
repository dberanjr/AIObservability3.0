import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import {
  buildDailyTokensQuery,
  buildServiceCostBreakdownQuery,
} from "./finopsQueries";
import { costOf } from "../../data/pricing";
import { toNum } from "../../data/format";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

interface DailyTokensRecord {
  model?: string;
  input_tokens?: (number | null)[] | null;
  output_tokens?: (number | null)[] | null;
}

interface ServiceCostRecord {
  service?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
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

export interface ServiceCost {
  service: string;
  tokens: number;
  cost: number;
  costPerMTok: number;
  topModel: string | null;
  modelCount: number;
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
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);

  const dailyResult = useScopedDql<DailyTokensRecord>(
    canQuery ? buildDailyTokensQuery(resolution.serviceIds, filters) : "",
    { enabled: canQuery, staleTime: 5 * 60_000 },
  );
  const serviceResult = useScopedDql<ServiceCostRecord>(
    canQuery
      ? buildServiceCostBreakdownQuery(resolution.serviceIds, scope.timeframe, filters)
      : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<FinOpsData>(() => {
    // ---- Daily cost timeseries ----
    const dailyRecords = dailyResult.data?.records ?? [];
    const series: DailyModelSeries[] = [];
    let dayCount = 7;
    for (const r of dailyRecords) {
      if (!r.model) continue;
      const inputs = (r.input_tokens ?? []).map((v) => num(v));
      const outputs = (r.output_tokens ?? []).map((v) => num(v));
      const len = Math.max(inputs.length, outputs.length);
      if (len > dayCount) dayCount = len;
      const values = Array.from({ length: len }, (_, i) =>
        costOf(inputs[i] ?? 0, outputs[i] ?? 0, r.model),
      );
      series.push({ model: r.model, values });
    }
    // Pad every series to dayCount.
    for (const s of series) {
      while (s.values.length < dayCount) s.values.push(0);
    }
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
      { tokens: number; cost: number; models: Set<string>; topModel: string; topModelTokens: number }
    >();
    for (const r of serviceResult.data?.records ?? []) {
      if (!r.service || !r.model) continue;
      const inputTokens = num(r.input_tokens);
      const outputTokens = num(r.output_tokens);
      const tokens = inputTokens + outputTokens;
      const cost = costOf(inputTokens, outputTokens, r.model);
      const entry =
        byService.get(r.service) ?? {
          tokens: 0,
          cost: 0,
          models: new Set<string>(),
          topModel: r.model,
          topModelTokens: 0,
        };
      entry.tokens += tokens;
      entry.cost += cost;
      entry.models.add(r.model);
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
        topModel: entry.topModel,
        modelCount: entry.models.size,
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
        resolution.isLoading || dailyResult.isLoading || serviceResult.isLoading,
      error: dailyResult.error ?? serviceResult.error ?? undefined,
    };
  }, [
    dailyResult.data,
    dailyResult.isLoading,
    dailyResult.error,
    serviceResult.data,
    serviceResult.isLoading,
    serviceResult.error,
    resolution.isLoading,
    filters,
  ]);
};
