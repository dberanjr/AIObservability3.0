import { TIER_COLORS } from "./constants";
import type { StageBreakdown } from "./useAgents";

/**
 * Per-stage label + canonical hue, keyed by StageBreakdown fields. Single
 * source shared by StageBreakdownBar (bar + legend + aria label) so the four
 * tiers are colored and named identically everywhere they appear.
 */
export const STAGE_META: {
  key: keyof StageBreakdown;
  label: string;
  color: string;
}[] = [
  { key: "llm", label: "LLM", color: TIER_COLORS.llm },
  { key: "tool", label: "Tool", color: TIER_COLORS.tool },
  { key: "retrieval", label: "Retrieval", color: TIER_COLORS.retrieval },
  { key: "orch", label: "Orchestration", color: TIER_COLORS.orchestration },
];

export interface DominantStage {
  key: keyof StageBreakdown;
  label: string;
  frac: number;
}

/** The stage carrying the largest share, or null when all stages are zero. */
export const dominantStage = (stage: StageBreakdown): DominantStage | null => {
  let best: DominantStage | null = null;
  for (const s of STAGE_META) {
    const frac = stage[s.key];
    if (frac > 0 && (best === null || frac > best.frac)) {
      best = { key: s.key, label: s.label, frac };
    }
  }
  return best;
};

/**
 * Accessible summary of a stage bar, e.g.
 * "Span mix: LLM 0%, Tool 40%, Retrieval 10%, Orchestration 50%". Given to the
 * bar as an aria-label so status isn't locked behind per-segment title hovers.
 */
export const stageMixLabel = (stage: StageBreakdown): string => {
  const parts = STAGE_META.map(
    (s) => `${s.label} ${Math.round(stage[s.key] * 100)}%`,
  );
  return `Span mix: ${parts.join(", ")}`;
};
