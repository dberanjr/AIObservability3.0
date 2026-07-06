import type { SemanticStatus } from "../../theme/statusColor";

/**
 * Classify a service (or fleet) error RATE, expressed as a percentage, into a
 * shared severity status so the Explorer error KPI tile and the AI-services row
 * status dot always agree: good ≤1%, warning 1–5%, critical >5% (the thresholds
 * already documented on the Errors tile). Non-finite input is treated as good so
 * a missing rate never raises a false alarm.
 */
export const errorRateStatus = (pct: number): SemanticStatus => {
  if (!Number.isFinite(pct)) return "good";
  if (pct > 5) return "critical";
  if (pct > 1) return "warning";
  return "good";
};
