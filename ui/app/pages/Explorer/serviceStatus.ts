import type { SemanticStatus, Sev } from "../../theme/statusColor";
import { statusFromThreshold } from "../../theme/statusColor";

/**
 * Sev ("ideal" | "warning" | "critical") → this module's SemanticStatus
 * vocabulary. `ideal` maps to `good` so existing call sites (the Errors KPI
 * tile emphasis and the AI-services row status dot) keep their current
 * status enum.
 */
const SEV_TO_STATUS: Record<Sev, SemanticStatus> = {
  ideal: "good",
  warning: "warning",
  critical: "critical",
};

/**
 * Classify a service (or fleet) error RATE, expressed as a percentage, into a
 * shared severity status so the Explorer error KPI tile and the AI-services row
 * status dot always agree. Thresholds now run through the shared
 * `statusFromThreshold` helper — the single source of truth for value → severity
 * across the app — with warn=1% / bad=5%: good below 1%, warning across 1–5%,
 * critical at or above 5% (the helper's `>=` boundaries). Non-finite input is
 * treated as good so a missing rate never raises a false alarm.
 */
export const errorRateStatus = (pct: number): SemanticStatus => {
  if (!Number.isFinite(pct)) return "good";
  return SEV_TO_STATUS[statusFromThreshold(pct, { warn: 1, bad: 5 })];
};
