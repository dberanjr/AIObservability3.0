/**
 * MCP & Tool Health status thresholds and classification.
 *
 * All thresholds are configurable constants. Status is evaluated in priority
 * order (error → latency → slow → tail → healthy) and stops at the first match,
 * exactly as specified in the page brief.
 */
export const MCP_THRESHOLDS = {
  /** Any error rate above this (percent) flags the row as an error. */
  errorRatePct: 0,
  /** KPI error-rate value turns red at or above this percent. */
  errorRateRedPct: 5,
  /** p95 at or above this (ms) is a hard latency breach (red). */
  latencyRedMs: 30000,
  /** p95 at or above this (ms) is slow (amber). */
  slowP95Ms: 10000,
  /** p50 at or above this (ms) is slow (amber). */
  slowP50Ms: 5000,
  /** p95 at or above this with a low p50 is a tail-latency breach (amber). */
  tailP95Ms: 5000,
  /** p50 below this paired with a high p95 indicates a tail problem. */
  tailP50Ms: 2000,
  /** KPI latency values render amber once they are in the seconds range. */
  kpiLatencyAmberMs: 1000,
} as const;

export type McpStatus = "error" | "latency" | "slow" | "tail" | "healthy";

export interface McpStatusInput {
  errorRatePct: number;
  p50Ms: number;
  p95Ms: number;
}

/**
 * Classify a tool/server row into a single status. Evaluated in priority
 * order; the first matching rule wins.
 */
export const computeMcpStatus = (row: McpStatusInput): McpStatus => {
  if (row.errorRatePct > MCP_THRESHOLDS.errorRatePct) return "error";
  if (row.p95Ms >= MCP_THRESHOLDS.latencyRedMs) return "latency";
  if (row.p95Ms >= MCP_THRESHOLDS.slowP95Ms || row.p50Ms >= MCP_THRESHOLDS.slowP50Ms)
    return "slow";
  if (row.p95Ms >= MCP_THRESHOLDS.tailP95Ms && row.p50Ms < MCP_THRESHOLDS.tailP50Ms)
    return "tail";
  return "healthy";
};

export type McpTone = "red" | "amber" | "green";

export interface McpStatusMeta {
  label: string;
  tone: McpTone;
  color: string;
}

export const MCP_STATUS_META: Record<McpStatus, McpStatusMeta> = {
  error: { label: "errors", tone: "red", color: "var(--red)" },
  latency: { label: "latency", tone: "red", color: "var(--red)" },
  slow: { label: "slow", tone: "amber", color: "var(--amber)" },
  tail: { label: "p95 tail", tone: "amber", color: "var(--amber)" },
  healthy: { label: "healthy", tone: "green", color: "var(--green-2)" },
};

/** Sort weight for the alert band: errors first, then latency outliers. */
export const MCP_STATUS_SEVERITY: Record<McpStatus, number> = {
  error: 0,
  latency: 1,
  slow: 2,
  tail: 3,
  healthy: 4,
};
