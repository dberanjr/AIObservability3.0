import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { buildAgentsQuery, buildAgentTraceJoinQuery } from "./queries";
import { costOf } from "../../data/pricing";
import { partitionAgents } from "../../detection/classifier";
import { canonicalizeModel } from "../../detection/attributes";
import { toNum } from "../../data/format";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

interface AgentRecord {
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
  framework?: string;
  error_rate_pct?: number;
}

interface TraceJoinRecord {
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

export interface UseAgentsResult {
  substantive: AgentRow[];
  orchestration: AgentRow[];
  all: AgentRow[];
  isLoading: boolean;
  error?: Error;
}

const computeStage = (rec: AgentRecord): StageBreakdown => {
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

export const useAgents = (): UseAgentsResult => {
  const { scope } = useScope();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const { filters } = useGlobalFilters();
  const canQuery = canQueryScope(_resolution);

  const { data, isLoading, error } = useScopedDql<AgentRecord>(
    canQuery ? buildAgentsQuery(serviceIds, scope.timeframe, filters) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  // Secondary query: attribute LLM cost/operations to agents via trace.id.
  // Opts out of global-filter injection: its first stage must keep BOTH agent
  // and LLM (null-agent) spans, which a span-level filter would break.
  const { data: joinData } = useScopedDql<TraceJoinRecord>(
    canQuery ? buildAgentTraceJoinQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000, ignoreGlobalFilter: true },
  );

  return useMemo<UseAgentsResult>(() => {
    // Build the agent → trace-join map first so the row loop can enrich.
    const joinByAgent = new Map<string, TraceJoinInfo>();
    for (const j of joinData?.records ?? []) {
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
    for (const r of data?.records ?? []) {
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
        ? join!.inputTokens
        : num(r.input_tokens);
      const outputTokens = costAttributed
        ? join!.outputTokens
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
        framework: r.framework ?? null,
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

    return {
      all,
      substantive: all.filter((a) => !a.isOrchestration),
      orchestration: all.filter((a) => a.isOrchestration),
      isLoading: servicesLoading || isLoading,
      error: error ?? undefined,
    };
  }, [data, joinData, isLoading, error, servicesLoading, filters]);
};
