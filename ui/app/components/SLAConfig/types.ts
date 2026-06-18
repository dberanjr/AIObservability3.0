export type SLAMetric =
  | "p90Ms"
  | "p99Ms"
  | "maxErrorRatePct"
  | "maxCostPerInvocation"
  | "maxTtftMs";

export interface SLAThresholds {
  p90Ms: number | null;
  p99Ms: number | null;
  maxErrorRatePct: number | null;
  maxCostPerInvocation: number | null;
  maxTtftMs: number | null;
}

export const EMPTY_THRESHOLDS: SLAThresholds = {
  p90Ms: null,
  p99Ms: null,
  maxErrorRatePct: null,
  maxCostPerInvocation: null,
  maxTtftMs: null,
};

export const SLA_METRIC_LABELS: Record<SLAMetric, string> = {
  p90Ms: "P90 latency",
  p99Ms: "P99 latency",
  maxErrorRatePct: "Max error rate",
  maxCostPerInvocation: "Max cost / invocation",
  maxTtftMs: "Max TTFT",
};

export const SLA_METRIC_UNITS: Record<SLAMetric, string> = {
  p90Ms: "ms",
  p99Ms: "ms",
  maxErrorRatePct: "%",
  maxCostPerInvocation: "$",
  maxTtftMs: "ms",
};

export const SLA_METRIC_ATTRS: Record<SLAMetric, string> = {
  p90Ms: "duration (P90 across agent spans)",
  p99Ms: "duration (P99 across agent spans)",
  maxErrorRatePct: "exception.type OR http.response.status_code ≥ 400 / total spans",
  maxCostPerInvocation:
    "gen_ai.usage.{input,output}_tokens × pricing.ts per model",
  maxTtftMs: "gen_ai.response.ttft (not yet instrumented)",
};

/** Number of thresholds currently set in the object. */
export const countActiveThresholds = (t: SLAThresholds): number =>
  Object.values(t).filter((v) => v != null).length;

export const hasAnyThreshold = (t: SLAThresholds): boolean =>
  countActiveThresholds(t) > 0;

/**
 * Tab-agnostic shape consumed by DegradedTrendPanel. Agents, Tools, and
 * Models can all funnel their slow-entity rows through this contract.
 */
export interface DegradedTrendItem {
  id: string;
  /** Display name (entity / agent / tool / model). */
  name: string;
  /** Current metric value (raw number — ms, %, etc.). */
  currentValue: number;
  /** Pre-formatted display value (e.g. "12.4s" or "8%"). */
  displayValue: string;
  /** Short metric label rendered next to the value (e.g. "P90"). */
  metricLabel: string;
  /** Trend points for the inline sparkline. */
  trend: number[];
  /** Baseline value used for the % comparison. */
  baseline: number;
  /** Percentage above (positive) / below (negative) the baseline. */
  pctVsBaseline: number;
  /** True when > 20% above baseline — surfaces the "Degraded" badge. */
  isDegraded: boolean;
  /** True when the active SLA threshold is crossed — surfaces the "SLA breach" badge. */
  isBreached: boolean;
}
