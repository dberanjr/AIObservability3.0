/**
 * Canned Demo Mode dataset for the Agents page (mirrors the pattern in
 * `ui/app/bedrock/demoData.ts`): rather than hand-writing each hook's final
 * *output* shape directly, this module builds small "raw record" fixtures
 * shaped exactly like what each real DQL query returns, then runs them
 * through the SAME parse/fold functions production data flows through (see
 * `./parse.ts`, extracted from the hooks for exactly this reuse). That keeps
 * every derived number (cost, error-rate colour, stage mix, "why flagged"
 * verdicts, …) computed by the real math instead of hand-typed and risking
 * drift from it.
 *
 * Agent NAMES are deliberately the SAME cast `useAgentLoops.ts` and
 * `useHighFrequencyAgents.ts` already use for their own (Pulse-shared) Demo
 * Mode branches — "trip-planner-agent" (a genuine LangGraph loop),
 * "refund-adjudicator" (loop + N+1 + the fleet's worst error rate + a
 * runaway P90) and "support-triage-agent" (healthy, high-volume) — so a
 * single Demo Mode session tells ONE coherent fleet story whether you're
 * looking at the Agents table, its KPI tiles/popups, or Pulse's architecture
 * map, rather than two disjoint casts.
 *
 * The dataset: 6 substantive agents across 5 frameworks (LangGraph ×2,
 * LangChain, CrewAI, LlamaIndex, one framework-less) plus one LangGraph
 * conditional-router node ("should_continue") that the real orchestration/
 * substantive classifier demotes out of the headline count — plus a
 * fleet-wide latency-by-tier split, upstream callers, an evaluation
 * snapshot, and per-agent tool tables. Three agents cross the slow-P90
 * threshold (feeding the Slow tile AND the Degraded-trend panel), one of
 * those ("refund-adjudicator") is a genuine RUNAWAY (P90 > 10 min) with the
 * fleet's worst error rate, and cost is attributed for some agents but
 * deliberately left "—" for others — mirroring the app's own documented
 * proxy-trace cost-attribution gap.
 */

import {
  parseAgentRows,
  parseOrchestrationNodes,
  parseAgentEvalCore,
  parseLoopSeries,
  parseLatencyTiers,
  parseUpstreamRows,
  type AgentRecord,
  type TraceJoinRecord,
  type AgentRow,
  type NodeRecord,
  type NodeRow,
  type EvalRecord,
  type AgentEvalCore,
  type TierRecord,
  type TierRow,
  type LatencyTier,
  type UpstreamRecord,
  type UpstreamService,
  type DegradedTrendRecord,
  type DegradedBaselineRecord,
} from "./parse";
import type { InvocationsForecast } from "./useInvocationsForecast";

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** Splits `total` across `weights.length` buckets proportionally to `weights`
 *  (need not sum to 1), fixing integer-rounding drift onto the largest bucket
 *  so the parts sum back to exactly `total` (mirrors bedrock/demoData.ts). */
const distribute = (total: number, weights: number[]): number[] => {
  const wsum = sum(weights);
  const raw = weights.map((w) => (total * w) / wsum);
  const floored = raw.map((x) => Math.round(x));
  const drift = total - sum(floored);
  const peakIdx = floored.indexOf(Math.max(...floored));
  floored[peakIdx] += drift;
  return floored;
};

// ---------------------------------------------------------------------------
// Agents table + KPI tiles (useAgents)
// ---------------------------------------------------------------------------

const DEMO_AGENT_RECORDS: AgentRecord[] = [
  {
    agent: "support-triage-agent",
    services: ["support-triage-service", null],
    service_ids: ["SERVICE-TRIAGE00000000000000000001", null],
    invocations: 3400,
    p50_ms: 520,
    p90_ms: 1450,
    p99_ms: 2600,
    avg_ms: 780,
    errors: 34,
    error_rate_pct: 1.0,
    input_tokens: 0,
    output_tokens: 0,
    llm_spans: 0,
    tool_spans: 1200,
    retrieval_spans: 200,
    orch_spans: 2000,
    avg_ttft_ms: null,
    models: [],
    fw_workflow: "support_triage_langgraph",
    fw_entity: null,
    fw_system: null,
    fw_span: "support-triage-agent",
  },
  {
    agent: "support-copilot",
    services: ["support-copilot-svc"],
    service_ids: ["SERVICE-SUPPORTCOPILOT000000000001"],
    invocations: 5200,
    p50_ms: 380,
    p90_ms: 890,
    p99_ms: 1500,
    avg_ms: 540,
    errors: 26,
    error_rate_pct: 0.5,
    input_tokens: 0,
    output_tokens: 0,
    llm_spans: 1400,
    tool_spans: 2600,
    retrieval_spans: 0,
    orch_spans: 1200,
    avg_ttft_ms: null,
    models: [],
    fw_workflow: null,
    fw_entity: "AgentExecutor",
    fw_system: null,
    fw_span: "support-copilot",
  },
  {
    agent: "code-review-agent",
    services: ["code-review-svc"],
    service_ids: ["SERVICE-CODEREVIEW0000000000000001"],
    invocations: 850,
    p50_ms: 1800,
    p90_ms: 3200,
    p99_ms: 5400,
    avg_ms: 2100,
    errors: 12,
    error_rate_pct: 1.4,
    input_tokens: 0,
    output_tokens: 0,
    llm_spans: 300,
    tool_spans: 2400,
    retrieval_spans: 100,
    orch_spans: 900,
    avg_ttft_ms: null,
    models: [],
    fw_workflow: "crew_code_review",
    fw_entity: null,
    fw_system: null,
    fw_span: "code-review-agent",
  },
  {
    agent: "sql-analyst-agent",
    services: ["data-analyst-svc"],
    service_ids: ["SERVICE-DATAANALYST00000000000001"],
    invocations: 2100,
    p50_ms: 750,
    p90_ms: 1400,
    p99_ms: 2200,
    avg_ms: 900,
    errors: 8,
    error_rate_pct: 0.4,
    input_tokens: 0,
    output_tokens: 0,
    llm_spans: 200,
    tool_spans: 100,
    retrieval_spans: 3100,
    orch_spans: 400,
    avg_ttft_ms: null,
    models: [],
    fw_workflow: "llama_index_query_engine",
    fw_entity: null,
    fw_system: null,
    fw_span: "sql-analyst-agent",
  },
  // The fleet's "problem child": elevated error rate, a genuine runaway P90
  // (> the 10-minute runaway threshold), AND (via useAgentLoops.ts /
  // useHighFrequencyAgents.ts's own Demo Mode fixtures) a LangGraph loop
  // signal and an N+1 tool-call flag — every "why flagged" signal at once,
  // a realistic worst-case agent.
  {
    agent: "refund-adjudicator",
    services: ["checkout-web"],
    service_ids: ["SERVICE-REFUNDADJUDICATOR0000001"],
    invocations: 1600,
    p50_ms: 38_000,
    p90_ms: 650_000,
    p99_ms: 920_000,
    avg_ms: 185_000,
    errors: 118,
    error_rate_pct: 7.4,
    input_tokens: 0,
    output_tokens: 0,
    llm_spans: 50,
    tool_spans: 1400,
    retrieval_spans: 50,
    orch_spans: 300,
    avg_ttft_ms: null,
    models: [],
    fw_workflow: null,
    fw_entity: null,
    fw_system: null,
    fw_span: "refund-adjudicator",
  },
  // Genuine LangGraph loop (paired with useAgentLoops.ts's own fixture row
  // for this same name) — slow but NOT runaway, a different severity tier
  // than refund-adjudicator so the table shows both amber and red.
  {
    agent: "trip-planner-agent",
    services: ["workflow-planner-svc"],
    service_ids: ["SERVICE-PLANNER00000000000000001"],
    invocations: 480,
    p50_ms: 1150,
    p90_ms: 2600,
    p99_ms: 4200,
    avg_ms: 1500,
    errors: 14,
    error_rate_pct: 2.9,
    input_tokens: 0,
    output_tokens: 0,
    llm_spans: 0,
    tool_spans: 900,
    retrieval_spans: 0,
    orch_spans: 3800,
    avg_ttft_ms: null,
    models: [],
    fw_workflow: "trip_planner_langgraph_state_machine",
    fw_entity: null,
    fw_system: null,
    fw_span: "trip-planner-agent",
  },
  // A LangGraph conditional-router node — a real gen_ai.agent.name value on
  // this tenant's fleet, but the classifier (name-list match) demotes it out
  // of the headline "Total agents" count into "Orchestration & runtime
  // nodes", exactly like a real LangGraph deployment.
  {
    agent: "should_continue",
    services: ["support-triage-service"],
    service_ids: ["SERVICE-TRIAGE00000000000000000001"],
    invocations: 9000,
    p50_ms: 8,
    p90_ms: 22,
    p99_ms: 40,
    avg_ms: 14,
    errors: 0,
    error_rate_pct: 0,
    input_tokens: 0,
    output_tokens: 0,
    llm_spans: 0,
    tool_spans: 0,
    retrieval_spans: 0,
    orch_spans: 9000,
    avg_ttft_ms: null,
    models: [],
    fw_workflow: null,
    fw_entity: null,
    fw_system: null,
    fw_span: "should_continue",
  },
];

/** Trace-join rows for the agents whose LLM calls DO share a trace with the
 *  agent span (LangChain / CrewAI / LlamaIndex instrumentations in this demo
 *  fleet) — the other agents deliberately have NO entry here, so their cost
 *  reads "—" exactly like the app's documented proxy-trace attribution gap. */
const DEMO_JOIN_RECORDS: TraceJoinRecord[] = [
  {
    agent: "support-copilot",
    linked_traces: 5200,
    input_tokens: 18_500_000,
    output_tokens: 6_200_000,
    operations: ["chat"],
    models: ["gpt-4o-mini"],
  },
  {
    agent: "code-review-agent",
    linked_traces: 850,
    input_tokens: 9_800_000,
    output_tokens: 4_100_000,
    operations: ["chat", "tool_use"],
    models: ["claude-opus-4-5"],
  },
  {
    agent: "sql-analyst-agent",
    linked_traces: 2100,
    input_tokens: 6_300_000,
    output_tokens: 1_450_000,
    operations: ["chat"],
    models: ["gemini-2-5-flash"],
  },
];

export const DEMO_AGENTS: AgentRow[] = parseAgentRows(
  DEMO_AGENT_RECORDS,
  DEMO_JOIN_RECORDS,
);
export const DEMO_AGENTS_SUBSTANTIVE: AgentRow[] = DEMO_AGENTS.filter(
  (a) => !a.isOrchestration,
);
export const DEMO_AGENTS_ORCHESTRATION: AgentRow[] = DEMO_AGENTS.filter(
  (a) => a.isOrchestration,
);

/** Total substantive invocations — the single source of truth the invocations
 *  chart / KPI tile and the degraded-trend baselines are kept consistent
 *  with. */
export const DEMO_TOTAL_INVOCATIONS: number = sum(
  DEMO_AGENTS_SUBSTANTIVE.map((a) => a.invocations),
);

// ---------------------------------------------------------------------------
// Orchestration & runtime nodes (useOrchestrationNodes)
// ---------------------------------------------------------------------------

const DEMO_ORCH_NODE_RECORDS: NodeRecord[] = [
  { node: "load_ticket_context", agent: "support-triage-agent", services: ["support-triage-service"], invocations: 3400, avg_ms: 22, p90_ms: 38, p99_ms: 60 },
  { node: "classify_priority", agent: "support-triage-agent", services: ["support-triage-service"], invocations: 3400, avg_ms: 15, p90_ms: 26, p99_ms: 40 },
  { node: "select_destination", agent: "trip-planner-agent", services: ["workflow-planner-svc"], invocations: 480, avg_ms: 340, p90_ms: 520, p99_ms: 780 },
  { node: "replan_evaluate", agent: "trip-planner-agent", services: ["workflow-planner-svc"], invocations: 1240, avg_ms: 410, p90_ms: 640, p99_ms: 900 },
  { node: "fetch_pr_metadata", agent: "code-review-agent", services: ["code-review-svc"], invocations: 850, avg_ms: 90, p90_ms: 140, p99_ms: 210 },
  { node: "aggregate_review_findings", agent: "code-review-agent", services: ["code-review-svc"], invocations: 850, avg_ms: 65, p90_ms: 100, p99_ms: 150 },
];
export const DEMO_ORCH_NODES: NodeRow[] = parseOrchestrationNodes(
  DEMO_ORCH_NODE_RECORDS,
);

// ---------------------------------------------------------------------------
// Evaluations (useAgentEval)
// ---------------------------------------------------------------------------

const DEMO_EVAL_RECORD: EvalRecord = {
  invocations: DEMO_TOTAL_INVOCATIONS,
  correctness_pct: 88.5,
  hallucination_pct: 3.2,
  success_pct: 84.0,
  avg_ctx_tokens: 3200,
  with_correctness: 4100,
  with_halluc: 4100,
  with_success: 4100,
};
export const DEMO_AGENT_EVAL: AgentEvalCore = parseAgentEvalCore(DEMO_EVAL_RECORD);

// ---------------------------------------------------------------------------
// Agent loop node-execution trend (useAgentLoopSeries)
//
// NB: per-agent loop ROWS live in useAgentLoops.ts's own Demo Mode fixture
// (shared with Pulse's architecture map, agent names "trip-planner-agent" /
// "refund-adjudicator" / "support-triage-agent" / "unattributed" — matched
// above) and the N+1 rows live in useHighFrequencyAgents.ts's own fixture —
// this module only supplies the fleet-wide node-execution TIME SERIES the
// Looping Agents popup charts, which neither of those hooks owns.
// ---------------------------------------------------------------------------

/** 24-bucket LangGraph node-execution trend with a rising shape (mean higher
 *  toward the recent end) so the popup chart shows real movement instead of
 *  a flat line. */
const LOOP_SERIES_SHAPE = [
  -0.30, -0.22, -0.28, -0.15, -0.20, -0.10, -0.18, -0.05, -0.12, 0.02,
  -0.06, 0.08, 0.00, 0.14, 0.06, 0.20, 0.10, 0.24, 0.16, 0.28,
  0.34, 0.22, 0.38, 0.42,
];
const DEMO_LOOP_SERIES_TOTAL = 4700;
const DEMO_LOOP_SERIES_VALUES = distribute(
  DEMO_LOOP_SERIES_TOTAL,
  LOOP_SERIES_SHAPE.map((v) => 1 + v),
);
export const DEMO_LOOP_SERIES = parseLoopSeries({
  node_execs: DEMO_LOOP_SERIES_VALUES,
});

// ---------------------------------------------------------------------------
// Latency by execution tier (useLatencyDecomposition)
// ---------------------------------------------------------------------------

const DEMO_LATENCY_TIER_RECORDS: TierRecord[] = (
  [
    { tier: "LLM", spans: 9600, avg_ms: 820, p95_ms: 2100 },
    { tier: "Tool", spans: 12800, avg_ms: 180, p95_ms: 420 },
    { tier: "Retrieval/DB", spans: 3400, avg_ms: 260, p95_ms: 610 },
    { tier: "Orchestration", spans: 18700, avg_ms: 35, p95_ms: 95 },
  ] as Array<{ tier: LatencyTier; spans: number; avg_ms: number; p95_ms: number }>
).map((t) => ({ ...t, total_ms: t.spans * t.avg_ms }));
export const DEMO_LATENCY_TIERS: { tiers: TierRow[]; totalMs: number; dominant: TierRow | null } =
  parseLatencyTiers(DEMO_LATENCY_TIER_RECORDS);

// ---------------------------------------------------------------------------
// Upstream services (useUpstreamServices)
// ---------------------------------------------------------------------------

const DEMO_UPSTREAM_RECORDS: UpstreamRecord[] = [
  { upstream: "web-gateway-svc", services: 3, targets: ["support-triage-service", "support-copilot-svc", "checkout-web"] },
  { upstream: "mobile-bff-svc", services: 2, targets: ["support-copilot-svc", "checkout-web"] },
  { upstream: "internal-ops-console", services: 2, targets: ["code-review-svc", "workflow-planner-svc"] },
];
export const DEMO_UPSTREAM_ROWS: UpstreamService[] = parseUpstreamRows(
  DEMO_UPSTREAM_RECORDS,
);

// ---------------------------------------------------------------------------
// Degraded-trend panel (useDegradedAgents) — the 3 slow (P90 > 2s) agents
// ---------------------------------------------------------------------------

/** Deterministic rising ramp (+ mild oscillation) from `startMs` to `endMs`
 *  over `n` buckets, in NANOSECONDS (what the real `p90_ns` field carries). */
const rampNs = (startMs: number, endMs: number, n: number): number[] =>
  Array.from({ length: n }, (_, i) => {
    const t = n <= 1 ? 1 : i / (n - 1);
    const base = startMs + (endMs - startMs) * t;
    const wobble = (i % 3 === 0 ? 1 : i % 3 === 1 ? -1 : 0.4) * (endMs - startMs) * 0.04;
    return Math.round((base + wobble) * 1_000_000);
  });

const DEGRADED_BUCKETS = 24;
/** Baseline = 75% of the current P90, so every demo slow agent reads as
 *  ~33% above its 7d baseline (> the panel's 20% "degraded" cutoff). */
const BASELINE_FACTOR = 0.75;

const degradedAgent = (agent: string, currentP90Ms: number): {
  trend: DegradedTrendRecord;
  baseline: DegradedBaselineRecord;
} => {
  const baselineMs = currentP90Ms * BASELINE_FACTOR;
  return {
    trend: { agent, p90_ns: rampNs(baselineMs, currentP90Ms, DEGRADED_BUCKETS) },
    baseline: { agent, baseline_ns: Math.round(baselineMs * 1_000_000) },
  };
};

const DEGRADED_AGENTS: Array<{ agent: string; p90Ms: number }> = [
  { agent: "refund-adjudicator", p90Ms: 650_000 },
  { agent: "code-review-agent", p90Ms: 3200 },
  { agent: "trip-planner-agent", p90Ms: 2600 },
];

export const DEMO_DEGRADED_TREND_RECORDS: DegradedTrendRecord[] = DEGRADED_AGENTS.map(
  (a) => degradedAgent(a.agent, a.p90Ms).trend,
);
export const DEMO_DEGRADED_BASELINE_RECORDS: DegradedBaselineRecord[] = DEGRADED_AGENTS.map(
  (a) => degradedAgent(a.agent, a.p90Ms).baseline,
);

// ---------------------------------------------------------------------------
// Invocations chart (useInvocationsChart) — one canned "makeTimeseries" record
// ---------------------------------------------------------------------------

export interface DemoInvocationsRecord {
  invocations: number[];
  interval: number;
  timeframe: { start: string; end: string };
}

/** 24-bucket fleet-wide invocation shape (mean ≈ 0), reused so the trend has
 *  a plausible business-hours-ish wave instead of a flat line. */
const INVOCATIONS_SHAPE = [
  -0.20, -0.32, -0.38, -0.30, -0.15, 0.05, 0.22, 0.35, 0.42, 0.30,
  0.18, 0.10, 0.02, -0.05, 0.08, 0.20, 0.32, 0.40, 0.28, 0.12,
  -0.02, -0.14, -0.24, -0.30,
];

/**
 * Builds the single record `makeTimeseries` would return for the demo fleet,
 * bucketed at `intervalSec` (the SAME snapped bucket the real hook picks for
 * the current toolbar timeframe) so the chart's x-axis granularity still
 * tracks the user's timeframe selector in Demo Mode. Anchored to "now" like
 * bedrock/demoData.ts's `demoTimeframe()`.
 */
export const buildDemoInvocationsRecord = (
  intervalSec: number,
  bucketCount = INVOCATIONS_SHAPE.length,
): DemoInvocationsRecord => {
  const now = Date.now();
  const shape = INVOCATIONS_SHAPE.slice(0, bucketCount);
  const values = distribute(
    DEMO_TOTAL_INVOCATIONS,
    shape.map((v) => 1 + v),
  );
  return {
    invocations: values,
    interval: intervalSec * 1_000_000_000,
    timeframe: {
      start: new Date(now - bucketCount * intervalSec * 1000).toISOString(),
      end: new Date(now).toISOString(),
    },
  };
};

/**
 * Synthetic forecast for Demo Mode — the real forecast calls a live Davis
 * Intelligence analyzer, which has no meaning against canned data (and would
 * be an unwanted network call while previewing). Deterministically
 * extrapolates the last few demo buckets' trend instead, in the SAME shape
 * `useInvocationsForecast` returns, so the Forecast toggle still renders a
 * plausible band without touching the network.
 */
export const buildDemoForecast = (
  historical: number[],
  intervalSec: number,
): InvocationsForecast | null => {
  if (historical.length < 4) return null;
  const horizon = Math.max(6, Math.round(historical.length * 0.3));
  const tailLen = Math.min(6, historical.length);
  const tail = historical.slice(-tailLen);
  const avg = sum(tail) / tail.length;
  const trend = (tail[tail.length - 1] - tail[0]) / Math.max(1, tailLen - 1);
  const values: number[] = [];
  const lower: number[] = [];
  const upper: number[] = [];
  for (let i = 1; i <= horizon; i++) {
    const wobble = (i % 3 === 0 ? 1 : i % 3 === 1 ? -1 : 0.3) * avg * 0.05;
    const v = Math.max(0, Math.round(avg + trend * i + wobble));
    values.push(v);
    lower.push(Math.max(0, Math.round(v * 0.85)));
    upper.push(Math.round(v * 1.15));
  }
  return { values, lower, upper, intervalSec };
};

// ---------------------------------------------------------------------------
// Per-agent Tools sub-view (AgentToolsSubview)
// ---------------------------------------------------------------------------

export interface DemoToolRow {
  tool: string;
  calls: number;
  avgMs: number;
  p90Ms: number;
  p99Ms: number;
  errorPct: number;
  retryPct: number;
}

/** One curated tool table per substantive demo agent, so expanding any row's
 *  Tools sub-view shows something real-looking rather than "no tool calls". */
export const DEMO_TOOL_ROWS_BY_AGENT: Record<string, DemoToolRow[]> = {
  "support-triage-agent": [
    { tool: "classify_intent", calls: 600, avgMs: 45, p90Ms: 80, p99Ms: 140, errorPct: 0.3, retryPct: 0.5 },
    { tool: "fetch_customer_profile", calls: 400, avgMs: 120, p90Ms: 190, p99Ms: 260, errorPct: 1.1, retryPct: 2.0 },
    { tool: "route_to_queue", calls: 200, avgMs: 30, p90Ms: 55, p99Ms: 90, errorPct: 0, retryPct: 0 },
  ],
  "support-copilot": [
    { tool: "answer_faq", calls: 1900, avgMs: 60, p90Ms: 95, p99Ms: 140, errorPct: 0.2, retryPct: 0.4 },
    { tool: "create_ticket", calls: 700, avgMs: 180, p90Ms: 260, p99Ms: 340, errorPct: 0.6, retryPct: 1.1 },
  ],
  "code-review-agent": [
    { tool: "run_linter", calls: 1100, avgMs: 310, p90Ms: 480, p99Ms: 650, errorPct: 2.8, retryPct: 5.1 },
    { tool: "fetch_pr_diff", calls: 700, avgMs: 220, p90Ms: 340, p99Ms: 480, errorPct: 0.4, retryPct: 1.0 },
    { tool: "post_review_comment", calls: 600, avgMs: 150, p90Ms: 230, p99Ms: 310, errorPct: 0.1, retryPct: 0.3 },
  ],
  // Small — this agent's real work (run_sql_query / vector_search_docs)
  // classifies as the "Retrieval/DB" tier (see retrieval_spans above), not
  // "Tool"; these are the few incidental utility calls that DO land in the
  // tool tier, matching this agent's tool_spans total exactly.
  "sql-analyst-agent": [
    { tool: "format_query_result", calls: 70, avgMs: 40, p90Ms: 70, p99Ms: 110, errorPct: 0.2, retryPct: 0.3 },
    { tool: "notify_requester", calls: 30, avgMs: 25, p90Ms: 45, p99Ms: 70, errorPct: 0, retryPct: 0 },
  ],
  "refund-adjudicator": [
    { tool: "validate_refund_policy", calls: 680, avgMs: 95, p90Ms: 150, p99Ms: 220, errorPct: 6.8, retryPct: 9.2 },
    { tool: "issue_refund", calls: 520, avgMs: 260, p90Ms: 410, p99Ms: 590, errorPct: 8.1, retryPct: 12.0 },
    { tool: "escalate_to_human", calls: 200, avgMs: 320, p90Ms: 480, p99Ms: 650, errorPct: 4.5, retryPct: 6.0 },
  ],
  "trip-planner-agent": [
    { tool: "replan_step", calls: 380, avgMs: 410, p90Ms: 650, p99Ms: 980, errorPct: 3.5, retryPct: 22.0 },
    { tool: "search_flights", calls: 340, avgMs: 280, p90Ms: 420, p99Ms: 560, errorPct: 1.8, retryPct: 5.0 },
    { tool: "dispatch_subtask", calls: 180, avgMs: 180, p90Ms: 280, p99Ms: 380, errorPct: 1.0, retryPct: 4.0 },
  ],
};
