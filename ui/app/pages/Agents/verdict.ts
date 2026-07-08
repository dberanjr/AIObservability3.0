import { fmtMs } from "../../data/format";
import { latencySeverity } from "./latency";
import { dominantStage } from "./stageMix";
import type { StageBreakdown } from "./useAgents";

export interface AgentVerdictSignals {
  p90Ms: number;
  errorRatePct: number;
  stage: StageBreakdown;
  /** Per-agent loop rate (%), when loop detection has a row for this agent. */
  loopRatePct?: number;
  /** True when this agent carries the high-tool-frequency (N+1) badge. */
  highFrequency?: boolean;
}

const DOMINANT_TIER_MIN = 0.5;
const HIGH_ERROR_PCT = 5;
const HIGH_LOOP_PCT = 15;

/**
 * Collapses the four scattered "why is this agent bad" signals (P90 severity,
 * dominant execution tier, error rate, loop rate, high tool frequency) into a
 * single ordered list of short phrases. Only notable signals are included, so a
 * healthy agent yields an empty list (the caller then hides the verdict).
 */
export const buildAgentVerdict = (s: AgentVerdictSignals): string[] => {
  const parts: string[] = [];

  const sev = latencySeverity(s.p90Ms);
  if (sev === "runaway") parts.push(`P90 ${fmtMs(s.p90Ms)} (runaway)`);
  else if (sev === "slow") parts.push(`P90 ${fmtMs(s.p90Ms)}`);

  const dom = dominantStage(s.stage);
  if (dom && dom.frac >= DOMINANT_TIER_MIN) {
    parts.push(`${dom.label} ${Math.round(dom.frac * 100)}%`);
  }

  if (s.errorRatePct > HIGH_ERROR_PCT) {
    parts.push(`${s.errorRatePct.toFixed(1)}% errors`);
  }

  if (s.loopRatePct != null && s.loopRatePct >= HIGH_LOOP_PCT) {
    parts.push(`${Math.round(s.loopRatePct)}% loop rate`);
  }

  if (s.highFrequency) parts.push("high tool frequency");

  return parts;
};
