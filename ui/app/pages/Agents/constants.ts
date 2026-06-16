/**
 * Per-environment default thresholds for the Agents tab. Sensible defaults;
 * overridable via the SLA-config drawer (see SLAContext) so nothing is tuned to
 * one tenant.
 */

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
