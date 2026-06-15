/**
 * Within-trace billable-token growth (redesign I.1) — the doc's centerpiece
 * pattern (cost doubling every couple of iterations as the scratchpad/history
 * is re-sent).
 *
 * PURE so it's unit-testable. Operates on billableTokens from the section-G
 * cost model, NOT raw input_tokens — so a loop that re-sends a cached prefix
 * (high raw input, low billable) is correctly seen as cheap and does NOT fire.
 *
 * Depends on the cost model being complete (Phase 2). Tag: agent / orchestrator.
 */
import { computeCost, type NormalizedTokens } from "../../../data/pricing";

/** Last LLM call's billable tokens must be >= this × the first call's. */
export const WITHIN_TRACE_GROWTH_RATIO = 2.5;
/** A trace needs at least this many sequential LLM calls to qualify. */
export const WITHIN_TRACE_MIN_CALLS = 3;

export interface GrowthResult {
  fired: boolean;
  growthRatio: number;
  billableSeq: number[];
  firstBillable: number;
  lastBillable: number;
}

/** Billable tokens for one call, via the cost model (excludes cache reads). */
export const billableOf = (t: NormalizedTokens): number =>
  computeCost(t, null).billableTokens;

/**
 * Detect billable tokens climbing iteration over iteration within one trace's
 * sequential LLM calls (calls MUST be time-ordered).
 */
export const detectWithinTraceGrowth = (
  calls: NormalizedTokens[],
): GrowthResult => {
  const seq = calls.map(billableOf);
  const n = seq.length;
  const first = seq[0] ?? 0;
  const last = seq[n - 1] ?? 0;
  const ratio = first > 0 ? last / first : 0;
  const isPeakAtEnd = n > 0 && last >= Math.max(...seq);
  const fired =
    n >= WITHIN_TRACE_MIN_CALLS &&
    first > 0 &&
    ratio >= WITHIN_TRACE_GROWTH_RATIO &&
    isPeakAtEnd;
  return {
    fired,
    growthRatio: ratio,
    billableSeq: seq,
    firstBillable: first,
    lastBillable: last,
  };
};
