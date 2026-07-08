import { SLOW_P90_MS, RUNAWAY_P90_MS } from "./constants";

/**
 * Latency-severity tiers shared by the Hero P90 bars and the table row
 * highlight so both agree with the Slow tile / View filter.
 *   ok       — within the slow threshold
 *   slow     — over the slow threshold (warn)
 *   runaway  — over the runaway threshold (critical; stuck / looping)
 */
export type LatencySeverity = "ok" | "slow" | "runaway";

export const latencySeverity = (p90Ms: number): LatencySeverity =>
  p90Ms > RUNAWAY_P90_MS ? "runaway" : p90Ms > SLOW_P90_MS ? "slow" : "ok";

/**
 * Linear-interpolated percentile over an unsorted numeric array (0–100). Used
 * to winsorize the P90 bar-list scale.
 */
export const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const idx = (Math.min(100, Math.max(0, p)) / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};

/**
 * A bar-list scale cap that clamps to a high percentile (default P95) instead
 * of the raw max, so a single runaway/looping agent saturates its bar rather
 * than crushing every normal agent into an unreadable sliver. Always ≥ 1 so the
 * caller never divides by zero.
 */
export const winsorizedMax = (values: number[], p = 95): number => {
  const finite = values.filter((v) => Number.isFinite(v) && v > 0);
  if (finite.length === 0) return 1;
  return Math.max(1, percentile(finite, p));
};
