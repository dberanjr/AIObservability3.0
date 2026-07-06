/**
 * Pure classifier for "why is this panel empty?".
 *
 * Every self-fetching panel already knows four booleans: did the query error,
 * did it hit the scan-limit budget, is the gating capability definitively
 * absent, and is the scope unresolved. This turns those into ONE cause so the
 * panel can render the right cause-aware <EmptyState> in a single call instead
 * of hand-rolling a branch (and usually mislabelling an error or a truncated
 * scan as "no data").
 *
 * No React here on purpose — the classifier is pure and unit-tested; the
 * cause -> icon/copy mapping lives in EmptyState.tsx.
 */

export type EmptyCause =
  | "no-activity"
  | "no-instrumentation"
  | "no-scope"
  | "error"
  | "truncated";

export interface EmptyCauseInput {
  /** A query error (any truthy Error / rejection). Highest precedence. */
  error?: unknown;
  /** The underlying query reached its scan-limit budget (results truncated). */
  limitHit?: boolean;
  /** The gating capability is DEFINITIVELY absent (cap.status() === 'absent'). */
  capabilityAbsent?: boolean;
  /** The scope resolved to nothing (no timeframe / segment matched). */
  scopeUnresolved?: boolean;
}

/**
 * Precedence — most-actionable / most-authoritative first:
 *   error > no-instrumentation > no-scope > truncated > no-activity
 *
 * Rationale: an error must never masquerade as "no data"; a definitively
 * missing attribute is a fixed onboarding step; an unresolved scope is the
 * user's own filter; a truncated scan is a raise-the-limit nudge; and only when
 * none of those hold is the panel genuinely empty (no activity).
 */
export const emptyCause = ({
  error,
  limitHit,
  capabilityAbsent,
  scopeUnresolved,
}: EmptyCauseInput = {}): EmptyCause => {
  if (error) return "error";
  if (capabilityAbsent) return "no-instrumentation";
  if (scopeUnresolved) return "no-scope";
  if (limitHit) return "truncated";
  return "no-activity";
};
