import type { Finding, FindingSeverity } from "../../../components/drawers/types";

export type AnomalyType =
  | "latency-spike"
  | "cost-spike"
  | "token-surge"
  | "runaway-agent";

export interface Anomaly extends Finding {
  type: AnomalyType;
}

export const ANOMALY_LABELS: Record<AnomalyType, string> = {
  "latency-spike": "Latency spike",
  "cost-spike": "Cost spike",
  "token-surge": "Token surge",
  "runaway-agent": "Runaway agent",
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
} as const;
