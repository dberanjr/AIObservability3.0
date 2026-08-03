/**
 * Pure parse/fold functions shared by the Agents-tab data hooks AND
 * demoData.ts. Extracted from each hook's own useMemo body so Demo Mode
 * fixtures (small "raw record" shapes matching what each real DQL query
 * returns) flow through the EXACT SAME transformation code real query results
 * do — see demoData.ts's doc comment for why that matters. Behavior for real
 * data is unchanged: each hook now just calls these functions instead of
 * inlining the same logic.
 */

import { costOf } from "../../data/pricing";
import { partitionAgents } from "../../detection/classifier";
import { canonicalizeModel } from "../../detection/attributes";
import { toNum } from "../../data/format";
import { resolveAgentFramework } from "./frameworkLabel";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

/* ------------------------------ Agents table ---------------------------- */

export interface AgentRecord {
  agent?: string;
  services?: Array<string | null>;
  service_ids?: Array<string | null>;
  invocations?: number;
  p50_ms?: number;
  p90_ms?: number;
  p99_ms?: number;
  avg_ms?: number;
  errors?: number;
  input_tokens?: number;
  output_tokens?: number;
  llm_spans?: number;
  tool_spans?: number;
  retrieval_spans?: number;
  orch_spans?: number;
  avg_ttft_ms?: number | null;
  models?: string[];
  fw_workflow?: string | null;
  fw_entity?: string | null;
  fw_system?: string | null;
  fw_span?: string | null;
  error_rate_pct?: number;
}

export interface TraceJoinRecord {
  agent?: string;
  linked_traces?: number;
  input_tokens?: number;
  output_tokens?: number;
  operations?: Array<string | null>;
  models?: Array<string | null>;
}

interface TraceJoinInfo {
  inputTokens: number;
  outputTokens: number;
  operations: string[];
  models: string[];
  linkedTraces: number;
}

export interface StageBreakdown {
  /**
   * Share of the agent's own (single-service) child spans by stage. Fractions
   * sum to ~1. LLM is usually ~0 because model calls run on the shared proxy in
   * separate traces — this reflects the agent's local orchestration/tool/
   * retrieval composition, not LLM time.
   */
  llm: number;
  tool: number;
  retrieval: number;
  orch: number;
}

export interface AgentRow {
  agent: string;
  service: string;
  serviceId: string;
  framework: string | null;
  models: string[];
  invocations: number;
  p50Ms: number;
  p90Ms: number;
  p99Ms: number;
  avgMs: number;
  errors: number;
  errorRatePct: number;
  inputTokens: number;
  outputTokens: number;
  llmCount: number;
  toolCount: number;
  hasLlmChild: boolean;
  hasToolChild: boolean;
  ttftMs: number | null;
  cost: number;
  costPerInvocation: number;
  /**
   * True when LLM token cost was attributable to this agent via shared
   * trace.id with proxy LLM spans. When false the UI shows "—" instead of
   * $0, because tokens live on the central proxy in a separate trace.
   */
  costAttributed: boolean;
  /** Distinct gen_ai.operation.name values seen in this agent's traces. */
  operations: string[];
  stage: StageBreakdown;
  isOrchestration: boolean;
}

export const computeStage = (rec: AgentRecord): StageBreakdown => {
  const llm = num(rec.llm_spans);
  const tool = num(rec.tool_spans);
  const retrieval = num(rec.retrieval_spans);
  const orch = num(rec.orch_spans);
  const total = llm + tool + retrieval + orch;
  if (total === 0) return { llm: 0, tool: 0, retrieval: 0, orch: 0 };
  return {
    llm: llm / total,
    tool: tool / total,
    retrieval: retrieval / total,
    orch: orch / total,
  };
};

/**
 * Builds the full per-agent row list (substantive + orchestration, undivided —
 * callers filter by `.isOrchestration`) from the two raw query results
 * the agents query and the trace-join query return. Shared by
 * `useAgents` (real data) and demoData.ts (canned fixtures) so both paths
 * exercise identical join/attribution/partition logic.
 */
export const parseAgentRows = (
  records: AgentRecord[],
  joinRecords: TraceJoinRecord[],
): AgentRow[] => {
  const joinByAgent = new Map<string, TraceJoinInfo>();
  for (const j of joinRecords) {
    if (!j.agent) continue;
    joinByAgent.set(j.agent, {
      inputTokens: num(j.input_tokens),
      outputTokens: num(j.output_tokens),
      operations: (j.operations ?? []).filter(
        (o): o is string => typeof o === "string" && o.length > 0,
      ),
      models: (j.models ?? []).filter(
        (m): m is string => typeof m === "string" && m.length > 0,
      ),
      linkedTraces: num(j.linked_traces),
    });
  }

  const all: AgentRow[] = [];
  for (const r of records) {
    if (!r.agent) continue;
    // Each agent is collected across its (named + null) service entities.
    // Prefer the named service for display and the named entity id for the
    // row key; fall back to the first available so the row still renders.
    const serviceList = (r.services ?? []).filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    );
    const serviceIdList = (r.service_ids ?? []).filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    );
    const service = serviceList[0] ?? "";
    const serviceId = serviceIdList[0] ?? r.agent;
    const invocations = num(r.invocations);
    const llmCount = num(r.llm_spans);
    const toolCount = num(r.tool_spans);
    // Token/cost attribution: agent spans carry no tokens (LLM calls run
    // through the proxy), so prefer the trace-join numbers. Fall back to the
    // agent-span tokens (usually 0) only when there's no link.
    const join = joinByAgent.get(r.agent);
    const costAttributed = !!join && join.linkedTraces > 0;
    const joinModels = join?.models ?? [];
    const agentSpanModels = (r.models ?? []).filter(
      (m): m is string => typeof m === "string" && m.length > 0,
    );
    // Prefer canonical model labels from the trace-join; de-dup.
    const models = Array.from(
      new Set(
        (joinModels.length > 0 ? joinModels : agentSpanModels).map(
          (m) => canonicalizeModel(m).label,
        ),
      ),
    );
    const inputTokens = costAttributed
      ? join.inputTokens
      : num(r.input_tokens);
    const outputTokens = costAttributed
      ? join.outputTokens
      : num(r.output_tokens);
    // Price with the dominant linked model (raw id), via the cache-aware
    // cost model — blended fallback so an unknown model estimates, not $0.
    const cost = costAttributed
      ? costOf(inputTokens, outputTokens, joinModels[0] ?? agentSpanModels[0])
      : 0;
    const costPerInvocation =
      costAttributed && invocations > 0 ? cost / invocations : 0;
    const operations = join?.operations ?? [];
    // hasLlmChild now also true when the trace-join linked LLM spans.
    const hasLlmChild = llmCount > 0 || costAttributed;
    const hasToolChild = toolCount > 0;
    const stage = computeStage(r);
    const ttftRaw = toNum(r.avg_ttft_ms);
    all.push({
      agent: r.agent,
      service,
      serviceId,
      framework: resolveAgentFramework(r),
      models,
      invocations,
      p50Ms: num(r.p50_ms),
      p90Ms: num(r.p90_ms),
      p99Ms: num(r.p99_ms),
      avgMs: num(r.avg_ms),
      errors: num(r.errors),
      errorRatePct: num(r.error_rate_pct),
      inputTokens,
      outputTokens,
      llmCount,
      toolCount,
      hasLlmChild,
      hasToolChild,
      ttftMs: Number.isFinite(ttftRaw) ? ttftRaw : null,
      cost,
      costPerInvocation,
      costAttributed,
      operations,
      stage,
      isOrchestration: false,
    });
  }

  const partition = partitionAgents(
    all.map((a) => ({
      agent: a.agent,
      avgMs: a.avgMs,
      hasLlmChild: a.hasLlmChild,
      hasToolChild: a.hasToolChild,
    })),
  );
  const orchNames = new Set(partition.orchestration.map((a) => a.agent));
  for (const a of all) {
    a.isOrchestration = orchNames.has(a.agent);
  }

  return all;
};

/* --------------------------- Orchestration nodes ------------------------- */

export interface NodeRecord {
  node?: string;
  agent?: string;
  services?: Array<string | null>;
  invocations?: number;
  avg_ms?: number;
  p90_ms?: number;
  p99_ms?: number;
}

export interface NodeRow {
  node: string;
  agent: string;
  service: string;
  invocations: number;
  avgMs: number;
  p90Ms: number;
  p99Ms: number;
}

export const parseOrchestrationNodes = (records: NodeRecord[]): NodeRow[] => {
  const nodes: NodeRow[] = [];
  for (const r of records) {
    if (!r.node || !r.agent) continue;
    const service =
      (r.services ?? []).find(
        (s): s is string => typeof s === "string" && s.length > 0,
      ) ?? r.agent;
    nodes.push({
      node: r.node,
      agent: r.agent,
      service,
      invocations: num(r.invocations),
      avgMs: num(r.avg_ms),
      p90Ms: num(r.p90_ms),
      p99Ms: num(r.p99_ms),
    });
  }
  return nodes;
};

/* --------------------------------- Eval ---------------------------------- */

export interface EvalRecord {
  invocations?: number;
  correctness_pct?: number | null;
  hallucination_pct?: number | null;
  success_pct?: number | null;
  avg_ctx_tokens?: number | null;
  with_correctness?: number;
  with_halluc?: number;
  with_success?: number;
}

export interface AgentEvalCore {
  hasAnyEval: boolean;
  toolCorrectnessPct: number | null;
  hallucinationPct: number | null;
  taskSuccessPct: number | null;
  avgCtxTokens: number | null;
  coverage: {
    correctness: number;
    hallucination: number;
    success: number;
    total: number;
  };
}

export const parseAgentEvalCore = (row: EvalRecord | undefined): AgentEvalCore => {
  const coverage = {
    correctness: row?.with_correctness ?? 0,
    hallucination: row?.with_halluc ?? 0,
    success: row?.with_success ?? 0,
    total: row?.invocations ?? 0,
  };
  const hasAnyEval =
    coverage.correctness + coverage.hallucination + coverage.success > 0;
  return {
    hasAnyEval,
    toolCorrectnessPct: row?.correctness_pct ?? null,
    hallucinationPct: row?.hallucination_pct ?? null,
    taskSuccessPct: row?.success_pct ?? null,
    avgCtxTokens: row?.avg_ctx_tokens ?? null,
    coverage,
  };
};

/* --------------------------- Agent loop series ---------------------------- */

// NB: per-agent loop ROWS (`useAgentLoops`) and the high-frequency-tool rows
// (`useHighFrequencyAgents`) each already carry their own self-contained
// `showExample` fold (shared with Pulse's architecture map) — see those hook
// files directly. Only the loop-execution TIME SERIES (below) is Agents-only
// and folds through this module.

export interface LoopSeriesRecord {
  node_execs?: (number | null)[] | null;
}

export const parseLoopSeries = (
  record: LoopSeriesRecord | undefined,
): { values: number[]; total: number } => {
  const values = (record?.node_execs ?? []).map((v) =>
    typeof v === "number" ? v : 0,
  );
  return { values, total: values.reduce((acc, v) => acc + v, 0) };
};

/* --------------------------- Latency decomposition ------------------------ */

export type LatencyTier = "LLM" | "Retrieval/DB" | "Tool" | "Orchestration";

export interface TierRecord {
  tier?: string;
  spans?: number;
  total_ms?: number;
  avg_ms?: number;
  p95_ms?: number;
}

export interface TierRow {
  tier: LatencyTier;
  spans: number;
  totalMs: number;
  avgMs: number;
  p95Ms: number;
  /** Share of total execution time across all tiers (0–100). */
  sharePct: number;
}

const TIER_ORDER: LatencyTier[] = [
  "LLM",
  "Retrieval/DB",
  "Tool",
  "Orchestration",
];

export const parseLatencyTiers = (
  records: TierRecord[],
): { tiers: TierRow[]; totalMs: number; dominant: TierRow | null } => {
  const raw = records
    .filter((r) => typeof r.tier === "string")
    .map((r) => ({
      tier: r.tier as LatencyTier,
      spans: num(r.spans),
      totalMs: num(r.total_ms),
      avgMs: num(r.avg_ms),
      p95Ms: num(r.p95_ms),
    }));
  const totalMs = raw.reduce((acc, r) => acc + r.totalMs, 0);
  const tiers: TierRow[] = raw
    .map((r) => ({
      ...r,
      sharePct: totalMs > 0 ? (r.totalMs / totalMs) * 100 : 0,
    }))
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
  const dominant =
    tiers.length > 0
      ? tiers.reduce((m, r) => (r.totalMs > m.totalMs ? r : m), tiers[0])
      : null;
  return { tiers, totalMs, dominant };
};

/* ------------------------------ Upstream services -------------------------- */

export interface UpstreamRecord {
  upstream?: string;
  services?: number;
  targets?: Array<string | null>;
}

export interface UpstreamService {
  upstream: string;
  /** Distinct in-scope AI services this upstream calls. */
  services: number;
  /** Names of the AI services it calls (for tooltip). */
  targets: string[];
}

export const parseUpstreamRows = (records: UpstreamRecord[]): UpstreamService[] => {
  const rows: UpstreamService[] = [];
  for (const r of records) {
    if (!r.upstream) continue;
    rows.push({
      upstream: r.upstream,
      services: r.services ?? 0,
      targets: (r.targets ?? []).filter(
        (t): t is string => typeof t === "string" && t.length > 0,
      ),
    });
  }
  return rows;
};

/* ------------------------------ Degraded trend ---------------------------- */

export interface DegradedTrendRecord {
  agent?: string;
  p90_ns?: (number | null)[] | null;
}

export interface DegradedBaselineRecord {
  agent?: string;
  baseline_ns?: number | null;
}

/** Builds the per-agent trend (ms) + 7d baseline (ms) lookup maps the
 *  DegradedTrendPanel item-builder reads from — shared between real query
 *  results and demoData.ts fixtures. */
export const buildDegradedTrendMaps = (
  trendRecords: DegradedTrendRecord[],
  baselineRecords: DegradedBaselineRecord[],
): { trendByAgent: Map<string, number[]>; baselineByAgent: Map<string, number> } => {
  const trendByAgent = new Map<string, number[]>();
  for (const r of trendRecords) {
    if (!r.agent) continue;
    const trend = (r.p90_ns ?? []).map((v) =>
      typeof v === "number" ? v / 1_000_000 : 0,
    );
    trendByAgent.set(r.agent, trend);
  }
  const baselineByAgent = new Map<string, number>();
  for (const r of baselineRecords) {
    if (!r.agent || typeof r.baseline_ns !== "number") continue;
    baselineByAgent.set(r.agent, r.baseline_ns / 1_000_000);
  }
  return { trendByAgent, baselineByAgent };
};
