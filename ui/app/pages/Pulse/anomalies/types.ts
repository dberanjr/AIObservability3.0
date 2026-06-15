import type { Finding, FindingSeverity } from "../../../components/drawers/types";

export type AnomalyType =
  | "latency-spike"
  | "cost-spike"
  | "token-surge"
  | "runaway-agent"
  | "within-trace-growth"
  | "model-mismatch"
  | "truncation"
  | "rate-limit"
  | "ttft-degradation";

export interface Anomaly extends Finding {
  type: AnomalyType;
}

export const ANOMALY_LABELS: Record<AnomalyType, string> = {
  "latency-spike": "Latency spike",
  "cost-spike": "Cost spike",
  "token-surge": "Token surge",
  "runaway-agent": "Runaway agent",
  "within-trace-growth": "Token growth (within trace)",
  "model-mismatch": "Model fallback / mismatch",
  truncation: "Context-window truncation",
  "rate-limit": "Provider rate-limit / backoff",
  "ttft-degradation": "TTFT degradation",
};

/** Severity ranking used for sort order. Higher = surfaced first. */
export const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

/** Static thresholds per SPEC handoff Session 4. */
export const THRESHOLDS = {
  /** Service P95 ratio vs fleet baseline that triggers a latency spike. */
  latencySpikeRatio: 2,
  /** Hourly cost ratio vs rolling 6h average that triggers a cost spike. */
  costSpikeRatio: 3,
  /** Per-service token ratio vs hourly average that triggers a token surge. */
  tokenSurgeRatio: 10,
  /** Agent P90 latency (ms) above which we consider the agent "runaway". */
  runawayAgentP90Ms: 600_000,
  /** Normalized request-vs-response model mismatch rate that triggers I.4. */
  modelMismatchRatio: 0.15,
  /** finish_reason max_tokens/length rate that triggers a truncation finding. */
  truncationRatio: 0.02,
  /** Rate-limited (429/throttle) request rate that triggers I.3. */
  rateLimitRatio: 0.01,
  /** Latest-hour TTFT vs rolling avg ratio that triggers I.5. */
  ttftDegradationRatio: 1.5,
} as const;
