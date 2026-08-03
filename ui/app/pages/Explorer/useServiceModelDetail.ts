import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useSampling } from "../../scope/SamplingContext";
import { useResolvedServices } from "../../scope/useResolvedServices";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import { canonicalizeModel } from "../../detection/attributes";
import { buildServiceModelDetailQuery } from "./queries";
import {
  computeServiceModelCost,
  type ServiceModelCost,
} from "./serviceModelCost";
import {
  foldDetailMetrics,
  type DetailRow,
  type ServiceModelMetrics,
} from "./foldDetailMetrics";
import { DEMO_SERVICE_MODEL_DETAIL } from "./demoData";

// Re-exported so existing call sites keep importing the row/metrics types and
// the pure folder from this hook module; the implementations live in the
// React-free ./foldDetailMetrics so they import cleanly under the node test
// runner (see serviceModelCost.test.ts).
export { foldDetailMetrics };
export type { DetailRow, ServiceModelMetrics };

export interface UseServiceModelDetailResult {
  metrics: ServiceModelMetrics | null;
  cost: ServiceModelCost | null;
  isLoading: boolean;
  error?: Error;
}

/**
 * Resolve the metrics + the three cost views for a single service×model cell.
 * Disabled (returns nulls) until a service and at least one raw model variant
 * are selected. `models` is the FULL list of raw `gen_ai.request.model` variants
 * that fold into the clicked cell's canonical column — the detail query matches
 * all of them so the metrics/cost equal the cell's aggregate (no undercount).
 * The sampling ratio is the toolbar's "1 in N" selector; cost extrapolation
 * needs the FRACTION observed, so we pass `1 / N` to computeServiceModelCost.
 *
 * `showExample` (defaulting to false so no existing call site changes
 * behaviour) looks up the clicked (service, canonical model) pair in the
 * bundled demo fixtures instead of querying Grail, then runs the SAME
 * `foldDetailMetrics` + `computeServiceModelCost` real math over that raw row
 * — used by ExplorerPage's Demo Mode / no-telemetry fallback so the heatmap's
 * detail modal stays interactive (real sampling/timeframe math) even in demo
 * mode. Only used by Explorer's ServiceModelModal.
 */
export const useServiceModelDetail = (
  service: string | null,
  models: string[] | null,
  showExample = false,
): UseServiceModelDetailResult => {
  const { scope } = useScope();
  const { filters } = useGlobalFilters();
  const { samplingRatio } = useSampling();
  const { serviceIds } = useResolvedServices();

  const enabled = !!service && !!models && models.length > 0;

  const query =
    enabled && !showExample
      ? buildServiceModelDetailQuery(
          serviceIds,
          scope.timeframe,
          service,
          models,
          filters,
        )
      : "";

  const { data, isLoading, error } = useScopedDql<DetailRow>(query, {
    enabled: enabled && !showExample,
    staleTime: 60_000,
  });

  return useMemo<UseServiceModelDetailResult>(() => {
    if (!enabled) {
      return { metrics: null, cost: null, isLoading: false };
    }

    if (!showExample && error) {
      return { metrics: null, cost: null, isLoading, error };
    }

    // All raw variants in `models` canonicalize to the same pricing/label, so
    // the first one is a correct representative for the single-model cost
    // lookup and (in demo mode) the demo fixture lookup key.
    const representativeModel = (models)[0];

    const row = showExample
      ? DEMO_SERVICE_MODEL_DETAIL[
          `${service}::${canonicalizeModel(representativeModel).label}`
        ]
      : data?.records?.[0];
    if (!row) {
      return { metrics: null, cost: null, isLoading: showExample ? false : isLoading };
    }

    const metrics = foldDetailMetrics(row);
    const { inTok, outTok } = metrics;

    // Toolbar samplingRatio is "1 in N" (1 = no sampling); the cost helper
    // wants the fraction observed. Demo fixtures are never sampled (fraction 1).
    const samplingFraction = showExample
      ? 1
      : Number.isFinite(samplingRatio) && samplingRatio > 0
        ? 1 / samplingRatio
        : 1;

    const tf = scope.timeframe;
    const cost = computeServiceModelCost({
      inTok,
      outTok,
      model: representativeModel,
      samplingRatio: samplingFraction,
      timeframeMs: timeframeDurationMs(tf.from, tf.to),
    });

    return { metrics, cost, isLoading: showExample ? false : isLoading };
  }, [
    enabled,
    showExample,
    service,
    data,
    isLoading,
    error,
    samplingRatio,
    models,
    scope.timeframe,
  ]);
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
