import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useSampling } from "../../scope/SamplingContext";
import { useResolvedServices } from "../../scope/useResolvedServices";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import { buildServiceModelDetailQuery } from "./queries";
import {
  computeServiceModelCost,
  type ServiceModelCost,
} from "./serviceModelCost";

/** One summarize row returned by buildServiceModelDetailQuery. */
export interface DetailRow {
  requests?: number;
  in_tok?: number;
  out_tok?: number;
  errors?: number;
  logical_errors?: number;
  p50_ns?: number;
  p90_ns?: number;
  p95_ns?: number;
}

/** Folded, UI-ready metrics for one service×model pair. */
export interface ServiceModelMetrics {
  requests: number;
  inTok: number;
  outTok: number;
  errors: number;
  logicalErrors: number;
  errorRatePct: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  tokensPerReq: number;
}

export interface UseServiceModelDetailResult {
  metrics: ServiceModelMetrics | null;
  cost: ServiceModelCost | null;
  isLoading: boolean;
}

const NS_PER_MS = 1_000_000;
const nsToMs = (ns: number | undefined): number =>
  Number.isFinite(ns) ? (ns as number) / NS_PER_MS : 0;

/** Coerce a possibly-undefined numeric field to a finite number. */
const num = (v: number | undefined): number => (Number.isFinite(v) ? (v as number) : 0);

/**
 * Resolve the metrics + the three cost views for a single service×model cell.
 * Disabled (returns nulls) until both service and model are selected. The
 * sampling ratio is the toolbar's "1 in N" selector; cost extrapolation needs
 * the FRACTION observed, so we pass `1 / N` to computeServiceModelCost.
 */
export const useServiceModelDetail = (
  service: string | null,
  model: string | null,
): UseServiceModelDetailResult => {
  const { scope } = useScope();
  const { filters } = useGlobalFilters();
  const { samplingRatio } = useSampling();
  const { serviceIds } = useResolvedServices();

  const enabled = !!service && !!model;

  const query = enabled
    ? buildServiceModelDetailQuery(
        serviceIds,
        scope.timeframe,
        service as string,
        model as string,
        filters,
      )
    : "";

  const { data, isLoading } = useScopedDql<DetailRow>(query, {
    enabled,
    staleTime: 60_000,
  });

  return useMemo<UseServiceModelDetailResult>(() => {
    if (!enabled) {
      return { metrics: null, cost: null, isLoading: false };
    }

    const row = data?.records?.[0];
    if (!row) {
      return { metrics: null, cost: null, isLoading };
    }

    const requests = num(row.requests);
    const inTok = num(row.in_tok);
    const outTok = num(row.out_tok);
    const errors = num(row.errors);
    const logicalErrors = num(row.logical_errors);

    const metrics: ServiceModelMetrics = {
      requests,
      inTok,
      outTok,
      errors,
      logicalErrors,
      errorRatePct: requests > 0 ? (errors / requests) * 100 : 0,
      p50Ms: nsToMs(row.p50_ns),
      p90Ms: nsToMs(row.p90_ns),
      p95Ms: nsToMs(row.p95_ns),
      tokensPerReq: requests > 0 ? (inTok + outTok) / requests : 0,
    };

    // Toolbar samplingRatio is "1 in N" (1 = no sampling); the cost helper
    // wants the fraction observed.
    const samplingFraction =
      Number.isFinite(samplingRatio) && samplingRatio > 0
        ? 1 / samplingRatio
        : 1;

    const tf = scope.timeframe;
    const cost = computeServiceModelCost({
      inTok,
      outTok,
      model: model as string,
      samplingRatio: samplingFraction,
      timeframeMs: timeframeDurationMs(tf.from, tf.to),
    });

    return { metrics, cost, isLoading };
  }, [enabled, data, isLoading, samplingRatio, model, scope.timeframe]);
};

/**
 * Best-effort duration (ms) of a relative `now()-Nx` window. Returns 0 for
 * absolute / unparseable timeframes so the monthly run-rate degrades to 0
 * rather than producing a nonsense projection. `to` is assumed `now()` when
 * absent (the only form the toolbar presets emit).
 */
const UNIT_MS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

export const timeframeDurationMs = (
  from: string,
  to?: string,
): number => {
  if (to && to !== "now()") {
    // Absolute window or non-now() upper bound: try ISO parse on both ends.
    const a = Date.parse(from);
    const b = Date.parse(to);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) return b - a;
    return 0;
  }
  const m = /^now\(\)\s*-\s*(\d+(?:\.\d+)?)([mhdw])$/.exec(from.trim());
  if (m) {
    const amount = parseFloat(m[1]);
    const unit = UNIT_MS[m[2]];
    if (Number.isFinite(amount) && unit) return amount * unit;
  }
  // Absolute ISO `from` with an implicit now() upper bound.
  const a = Date.parse(from);
  if (Number.isFinite(a)) return Math.max(0, Date.now() - a);
  return 0;
};
