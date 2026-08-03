/**
 * Canned Demo Mode dataset for the four hooks that are unique to the
 * Summary page (not shared with any other tab): useFleetPosture's own
 * fleet-counts query, useHiddenFailures, and useProblemPatternCounts.
 * (`useModelConcentration` needs no fixture of its own — it passes
 * `showExample` straight through to the shared `useModels` hook, which
 * already carries `DEMO_MODEL_RECORDS`.)
 *
 * Mirrors `ui/app/bedrock/demoData.ts`: small "raw record" fixtures run
 * through the SAME `compute*` fold every hook calls (factored into
 * `./parse`, kept out of the hook files themselves so this module doesn't
 * create a circular import).
 *
 * The same-span pattern counts and cross-span trace counts are built from
 * the REAL `FOCUS_PREDICATES` / `CROSS_SPAN_FOCUS` registries (via
 * `patternAlias`) so a demo pattern id can never silently drift from the real
 * detector list the Prompts sidebar and Pulse drill-downs use.
 */

import { FOCUS_PREDICATES, CROSS_SPAN_FOCUS } from "../Prompts/focus";
import { patternAlias } from "./queries";
import { computeHiddenFailures, computeProblemPatternCounts } from "./parse";

// ---------------------------------------------------------------------------
// useFleetPosture — the posture hero's "N services · M agents" subline
// ---------------------------------------------------------------------------

export const DEMO_FLEET_COUNTS = { services: 14, agents: 7 };

// ---------------------------------------------------------------------------
// useHiddenFailures — HiddenFailuresCard + PostureBand's "Hidden risk" KPI
// ---------------------------------------------------------------------------

export const DEMO_HIDDEN_FAILURES = computeHiddenFailures(
  { refusals: 42, truncations: 118, content_filters: 25, other: 9 },
  1,
);

// ---------------------------------------------------------------------------
// useProblemPatternCounts — ProblemPatternsCard
// ---------------------------------------------------------------------------

/** Plausible match volume per same-span detector (the LLM-population scan).
 *  `orch-token-growth`'s predicate matches almost any token-bearing prompt,
 *  so it's realistically the largest — same skew a real tenant would show. */
const SAME_SPAN_COUNTS: Record<string, number> = {
  "llm-ctx-exhaustion": 145,
  "llm-logical-errors": 320,
  "llm-rate-limit": 58,
  "llm-model-mismatch": 210,
  "llm-ttft-degradation": 40,
  "tool-token-spike": 95,
  "orch-token-growth": 5200,
};

const DEMO_SAME_SPAN_ROW: Record<string, number> = Object.fromEntries(
  Object.keys(FOCUS_PREDICATES).map((id) => [
    patternAlias(id),
    SAME_SPAN_COUNTS[id] ?? 0,
  ]),
);

/** Resolved-trace counts per cross-span detector (only `.length` is ever
 *  read from the real resolver's record array, so a count fixture is enough). */
const DEMO_CROSS_SPAN_COUNTS: Record<string, number> = Object.fromEntries(
  Object.keys(CROSS_SPAN_FOCUS).map((id) => {
    const counts: Record<string, number> = {
      "tool-retry-storm": 34,
      "agent-n1-tool-calls": 22,
      "vdb-topk-over-retrieval": 68,
      "mem-history-growth": 145,
    };
    return [id, counts[id] ?? 0];
  }),
);

export const DEMO_PROBLEM_PATTERNS = computeProblemPatternCounts(
  DEMO_SAME_SPAN_ROW,
  DEMO_CROSS_SPAN_COUNTS,
  1,
);
