/**
 * Canned Demo Mode dataset for Pulse's architecture map (the page's hero) and
 * its directly-owned supporting hooks (per-tier sparkline series,
 * orchestration-framework nodes). Reference implementation: `bedrock/demoData.ts`.
 *
 * Design: `useArchitectureData` derives everything it renders from ONE raw
 * tier-summarize row (shaped exactly like `buildQuery`'s result) plus the
 * outputs of half a dozen sub-hooks (agent loops, high-frequency agents,
 * resolved counts, anomalies, client upstream, spend, per-bucket series) —
 * each of THOSE sub-hooks already carries its own `showExample` branch (see
 * `useAgentLoops.ts`, `useHighFrequencyAgents.ts`, `../../scope/useResolvedCounts.ts`,
 * `../anomalies/demoData.ts`, `useClientUpstream.ts`, `../useSpendBreakdown.ts`).
 * So this module only needs to supply the fixtures those hooks don't already
 * own: the map's own tier totals (`DEMO_ARCH_REC`), its per-bucket series
 * (`DEMO_PULSE_SERIES_REC`, folded by the real `foldPulseSeries`), and the
 * framework-node breakdown (`DEMO_FRAMEWORK_NODE_ROWS`, folded by the real
 * `rowsToFrameworkNodes`) — every derived number then flows through the SAME
 * `useArchitectureData` memo / `usePulseSeries` fold / `rowsToFrameworkNodes`
 * fold the real data does, not a hand-typed parallel shape.
 *
 * The dataset: an 18.5k-call LLM tier (~42M tokens), a 9.8k-call agent tier,
 * a 14.2k-call tool tier (error rate nudged just over the warning threshold
 * so the map shows genuine variety, not an all-green fleet), 3 orchestration
 * frameworks (LangGraph dominant, CrewAI, LlamaIndex, a small "Other" tail),
 * and an 8-bucket (hourly) window with hand-tuned per-tier variance so every
 * sparkline shows real movement instead of a flat repeated value.
 */

import { rowsToFrameworkNodes, type FrameworkNodeRow, type FrameworkNode } from "./frameworkNodes";
import type { PulseSeriesRec } from "./usePulseSeries";

// ---------------------------------------------------------------------------
// Shared bucket/variance helpers (same shape as bedrock/demoData.ts)
// ---------------------------------------------------------------------------

const BUCKETS = 8;
const HOUR_MS = 3_600_000;
const NOW_MS = Date.now();
const WINDOW_START_MS = NOW_MS - BUCKETS * HOUR_MS;

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** Splits `total` across `weights.length` buckets proportionally to `weights`,
 *  fixing integer-rounding drift onto the largest bucket so the parts sum
 *  back to exactly `total` — for additive (`sum()`/`count()`) metrics. */
const distribute = (total: number, weights: number[]): number[] => {
  const wsum = sum(weights);
  const raw = weights.map((w) => (total * w) / wsum);
  const floored = raw.map((x) => Math.round(x));
  const drift = total - sum(floored);
  const peakIdx = floored.indexOf(Math.max(...floored));
  floored[peakIdx] += drift;
  return floored;
};

/** Positive per-bucket weights from a signed variance shape (mean ≈ 0). */
const weightsOf = (shape: number[]): number[] => shape.map((v) => 1 + v);

/** Bucketed series whose MAX equals `peak` — for `percentile()`-folded
 *  metrics (e.g. p90 latency), which aren't additive across buckets. */
const seriesWithPeak = (peak: number, shape: number[]): number[] => {
  const maxV = Math.max(...shape);
  const k = peak / (1 + maxV);
  return shape.map((v) => Math.round(k * (1 + v)));
};

/** Hand-tuned 8-bucket fractional-deviation patterns (mean ≈ 0), one per tier
 *  so each tier's trend moves independently instead of 4 identical copies. */
const VARIANCE: Record<"orchestrator" | "agent" | "tools" | "llm", number[]> = {
  orchestrator: [-0.1, 0.12, -0.06, 0.2, -0.15, 0.05, 0.1, -0.04],
  agent: [0.08, -0.05, 0.15, -0.1, 0.02, 0.18, -0.12, 0.06],
  tools: [-0.05, 0.1, -0.12, 0.08, 0.16, -0.08, 0.02, 0.09],
  llm: [0.05, -0.08, 0.1, -0.04, 0.14, -0.1, 0.02, 0.13],
};

// ---------------------------------------------------------------------------
// Main tier summarize row (useArchitectureData's own `buildQuery`)
// ---------------------------------------------------------------------------

/** Raw summarize row — same shape `useArchitectureData`'s `Rec` interface
 *  expects. Tool-tier error rate is nudged just over the 3% warning
 *  threshold and the orchestrator/agent p90s sit above the 2s warning
 *  threshold, so the map shows genuine amber variety rather than reading as
 *  uniformly healthy. */
export const DEMO_ARCH_REC = {
  llmSpans: 18_500,
  llmTokens: 42_000_000,
  llmErr: 210, // ~1.1%
  llmTrunc: 96, // ~0.5%
  llm429: 34,
  llmP90Ns: 1_450_000_000, // 1.45s
  agentSpans: 9_800,
  agentErr: 145, // ~1.5%
  agentP90Ns: 2_200_000_000, // 2.2s — above the 2s warning threshold
  toolSpans: 14_200,
  toolErr: 480, // ~3.4% — above the 3% warning threshold
  toolP90Ns: 680_000_000, // 0.68s
  vectorSpans: 5_400,
  memorySpans: 3_100,
  checkpointSpans: 450,
  workflowSpans: 7_600,
  workflowErr: 88, // ~1.2%
  workflowP90Ns: 3_100_000_000, // 3.1s — above the 2s warning threshold
};

// ---------------------------------------------------------------------------
// Per-bucket pulse series (usePulseSeries) — folded via foldPulseSeries
// ---------------------------------------------------------------------------

export const DEMO_PULSE_SERIES_REC: PulseSeriesRec = {
  o_calls: distribute(DEMO_ARCH_REC.workflowSpans, weightsOf(VARIANCE.orchestrator)),
  a_calls: distribute(DEMO_ARCH_REC.agentSpans, weightsOf(VARIANCE.agent)),
  t_calls: distribute(DEMO_ARCH_REC.toolSpans, weightsOf(VARIANCE.tools)),
  l_calls: distribute(DEMO_ARCH_REC.llmSpans, weightsOf(VARIANCE.llm)),
  o_p90: seriesWithPeak(DEMO_ARCH_REC.workflowP90Ns, VARIANCE.orchestrator),
  a_p90: seriesWithPeak(DEMO_ARCH_REC.agentP90Ns, VARIANCE.agent),
  t_p90: seriesWithPeak(DEMO_ARCH_REC.toolP90Ns, VARIANCE.tools),
  l_p90: seriesWithPeak(DEMO_ARCH_REC.llmP90Ns, VARIANCE.llm),
  o_err: distribute(DEMO_ARCH_REC.workflowErr, weightsOf(VARIANCE.orchestrator)),
  a_err: distribute(DEMO_ARCH_REC.agentErr, weightsOf(VARIANCE.agent)),
  t_err: distribute(DEMO_ARCH_REC.toolErr, weightsOf(VARIANCE.tools)),
  l_err: distribute(DEMO_ARCH_REC.llmErr, weightsOf(VARIANCE.llm)),
  l_trunc: distribute(DEMO_ARCH_REC.llmTrunc, weightsOf(VARIANCE.llm)),
  l_429: distribute(DEMO_ARCH_REC.llm429, weightsOf(VARIANCE.llm)),
  l_tok: distribute(DEMO_ARCH_REC.llmTokens, weightsOf(VARIANCE.llm)),
  l_in: distribute(Math.round(DEMO_ARCH_REC.llmTokens * 0.62), weightsOf(VARIANCE.llm)),
  l_out: distribute(Math.round(DEMO_ARCH_REC.llmTokens * 0.38), weightsOf(VARIANCE.llm)),
  p95: seriesWithPeak(1_800_000_000, VARIANCE.llm),
  timeframe: {
    start: new Date(WINDOW_START_MS).toISOString(),
    end: new Date(NOW_MS).toISOString(),
  },
  interval: HOUR_MS * 1e6,
};

// ---------------------------------------------------------------------------
// Orchestration-framework nodes (useFrameworkNodes) — folded via rowsToFrameworkNodes
// ---------------------------------------------------------------------------

/** Raw labeled rows — counts sum to the workflow tier's total span count
 *  (7,600, see `DEMO_ARCH_REC` above) so the split-orchestrator framework
 *  nodes reconcile with the map's orchestrator-tier total. */
const DEMO_FRAMEWORK_ROWS: FrameworkNodeRow[] = [
  { fw: "LangGraph", n: 4_200, err: 62, p90ns: 2_100_000_000 },
  { fw: "CrewAI", n: 1_900, err: 18, p90ns: 1_450_000_000 },
  { fw: "LlamaIndex", n: 900, err: 4, p90ns: 980_000_000 },
  { fw: "Other", n: 600, err: 4, p90ns: 1_200_000_000 },
];
export const DEMO_FRAMEWORK_NODE_ROWS: FrameworkNodeRow[] = DEMO_FRAMEWORK_ROWS;
/** Pre-folded (via the real `rowsToFrameworkNodes`) — exported for tests. */
export const DEMO_FRAMEWORK_NODES: FrameworkNode[] = rowsToFrameworkNodes(DEMO_FRAMEWORK_ROWS);
