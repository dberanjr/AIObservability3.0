/**
 * Per-environment default thresholds for the Agents tab. Sensible defaults;
 * overridable via the SLA-config drawer (see SLAContext) so nothing is tuned to
 * one tenant.
 */

/**
 * Single source of truth for the "slow" P90 threshold. The Slow tile, the Slow
 * View filter, the Hero P90 bar colors, and the table row highlight all read
 * this so a P90 counted "slow" in the tile is highlighted "slow" in the table
 * (previously the table used its own 5 s cutoff and silently disagreed).
 */
export const SLOW_P90_MS = 2000;

/**
 * The "runaway" P90 threshold (10 minutes): an agent almost certainly stuck or
 * looping. Renders as the critical/red tier everywhere latency severity is
 * shown.
 */
export const RUNAWAY_P90_MS = 600_000;

/**
 * Canonical hue per execution tier / stage. Shared by StageBreakdownBar and
 * LatencyTierPanel (which sit inches apart) so the same concept is always the
 * same color — previously Tool and Retrieval were literally swapped between the
 * two panels. One reserved hue per concept: LLM=purple, Tool=amber,
 * Retrieval=cyan, Orchestration=slate/gray.
 */
export const TIER_COLORS = {
  llm: "var(--purple)",
  tool: "var(--amber)",
  retrieval: "var(--cyan)",
  orchestration: "var(--text-4)",
} as const;

/**
 * "High tool frequency" / N+1 threshold: an agent gets the badge when a SINGLE
 * tool is called more than this many times within the timeframe — the AI
 * analogue of an N+1 query. Default is deliberately conservative; raise it for
 * batch-heavy workloads via SLA-config.
 */
export const HIGH_FREQUENCY_TOOL_THRESHOLD = 10;

/**
 * The high-frequency predicate: a tool is high-frequency when its call count is
 * strictly ABOVE the threshold (not at or below it). Pure so it's testable and
 * shared by the per-tool highlight and the per-agent badge.
 */
export const isHighFrequency = (
  calls: number,
  threshold: number = HIGH_FREQUENCY_TOOL_THRESHOLD,
): boolean => calls > threshold;
