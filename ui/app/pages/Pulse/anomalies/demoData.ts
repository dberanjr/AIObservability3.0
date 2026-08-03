/**
 * Canned Demo Mode dataset for `useAnomalies` — Pulse's "Top issues requiring
 * attention" strip, the architecture map's per-tier finding badges, and
 * Summary's `TopFindingsCard` (all three share this one hook).
 *
 * Unlike most of this app's demo datasets, these are hand-authored `Anomaly`
 * objects rather than raw-record fixtures piped through a fold: the real hook
 * combines NINE independently-thresholded DQL queries (latency spike, cost
 * spike, token surge, runaway agent, within-trace growth, model mismatch,
 * truncation, rate-limit, TTFT degradation), and its fold (`computeAnomalies`)
 * lives in `useAnomalies.ts` itself — importing it here would create a
 * circular module dependency (`useAnomalies.ts` also imports `DEMO_ANOMALIES`
 * from this file). A `Finding` is already a "final display" object (severity +
 * prose), not a numeric tile whose cross-tile arithmetic needs to reconcile,
 * so hand-authoring is a reasonable trade — severities/ratios below are picked
 * to match the real hook's own threshold constants (see `./types.ts`
 * THRESHOLDS) and entity/agent names are drawn from the SAME cast used
 * elsewhere in Pulse's demo data (`refund-adjudicator`, `trip-planner-agent`,
 * Claude model ids) so the story reads as one coherent fleet across tiles.
 */
import { DEFAULT_FINDING_INTENTS } from "../../../components/drawers/types";
import type { Anomaly } from "./types";

export const DEMO_ANOMALIES: Anomaly[] = [
  {
    id: "runaway-refund-adjudicator",
    type: "runaway-agent",
    // p90 22m is above the hook's 10-minute runaway threshold and above its
    // own critical cutoff (20m) — matches its severity rule.
    severity: "critical",
    category: "Runaway agent",
    entity: "refund-adjudicator · checkout-web",
    metric: "p90 22m 0s",
    context: "Above the 10m runaway threshold across 71 invocations",
    detail:
      "Agent invocations are running longer than the 10-minute runaway threshold. Likely candidates: unbounded tool loops, retry storms, or a tool that hangs without timeout.",
    intents: DEFAULT_FINDING_INTENTS,
    layer: "agent",
  },
  {
    id: "latency-spike-support-triage",
    type: "latency-spike",
    // 3.0x fleet baseline — above the hook's 2x spike threshold but below
    // its critical cutoff (4x) — matches its "warning" rule.
    severity: "warning",
    category: "Latency spike",
    entity: "support-triage-service",
    metric: "p95 6.8s",
    context: "3.0× fleet baseline (2.3s)",
    detail:
      "Service p95 latency for AI spans is 3.0x the fleet median (across 6 services) over 4,120 spans.",
    intents: DEFAULT_FINDING_INTENTS,
  },
  {
    id: "within-trace-growth",
    type: "within-trace-growth",
    severity: "warning",
    category: "Token growth (within trace)",
    entity: "trip-planner-agent",
    metric: "12 prompts",
    context: "Billable tokens climbing up to 4.4× within a prompt",
    detail:
      "Sequential LLM calls in a trace re-send an accumulating scratchpad/history, so billable tokens (cache reads excluded) climb iteration over iteration — the classic agent token runaway. Trim history, summarize, or cache the stable prefix.",
    intents: DEFAULT_FINDING_INTENTS,
    layer: "orchestrator",
  },
  {
    id: "truncation",
    type: "truncation",
    // 3.1% is above THRESHOLDS.truncationRatio (2%) but below the hook's
    // critical cutoff (10%) — matches its "warning" rule.
    severity: "warning",
    category: "Context-window truncation",
    entity: "Fleet",
    metric: "3.1%",
    context: "Responses truncated for length (finish_reason max_tokens / length)",
    detail:
      "A share of generations hit the output/context limit and were cut off, returning incomplete answers. Raise max_tokens, shorten prompts, or chunk the work.",
    intents: DEFAULT_FINDING_INTENTS,
    layer: "llm",
  },
  {
    id: "model-mismatch",
    type: "model-mismatch",
    // 18% is above the hook's 15% mismatch threshold but below its "mostly
    // mismatched" cutoff (50%) — matches its "info" rule.
    severity: "info",
    category: "Model fallback / mismatch",
    entity: "Fleet",
    metric: "18.0%",
    context: "Requests served by a different model than requested (version suffixes normalized out)",
    detail:
      "The provider returned a different model than requested on a meaningful share of calls — a fallback/routing change that can shift cost and quality. Version-only differences (dated snapshots) are not counted.",
    intents: DEFAULT_FINDING_INTENTS,
    layer: "llm",
  },
];
