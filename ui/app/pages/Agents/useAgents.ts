import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { buildAgentsQuery } from "./queries";
import { estimateCost, getPricing } from "../../data/pricing";
import { partitionAgents } from "../../detection/classifier";
import { toNum } from "../../data/format";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

interface AgentRecord {
  agent?: string;
  service?: string;
  service_id?: string;
  invocations?: number;
  p50_ms?: number;
  p90_ms?: number;
  p99_ms?: number;
  avg_ms?: number;
  errors?: number;
  input_tokens?: number;
  output_tokens?: number;
  llm_count?: number;
  tool_count?: number;
  avg_ttft_ms?: number | null;
  models?: string[];
  framework?: string;
  error_rate_pct?: number;
}

export interface StageBreakdown {
  /** Fractions sum to ~1. */
  llm: number;
  tool: number;
  orch: number;
  wait: number;
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
  const total = num(rec.invocations);
  if (total === 0) return { llm: 0, tool: 0, orch: 0, wait: 0 };
  const llmFrac = num(rec.llm_count) / total;
  const toolFrac = num(rec.tool_count) / total;
  // Orchestration: heuristic placeholder until parent-child tree query lands.
  const orchFrac = Math.max(0, 0.15 - llmFrac * 0.1);
  const sum = Math.min(1, llmFrac + toolFrac + orchFrac);
  const wait = Math.max(0, 1 - sum);
  return { llm: llmFrac, tool: toolFrac, orch: orchFrac, wait };
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

  return useMemo<UseAgentsResult>(() => {
    const all: AgentRow[] = [];
    for (const r of data?.records ?? []) {
      if (!r.agent || !r.service_id) continue;
      const models = (r.models ?? []).filter(
        (m): m is string => typeof m === "string" && m.length > 0,
      );
      // Cost per agent: blended over the models the agent invoked. We don't
      // get per-row I/O split by model from this aggregation, so we apply the
      // dominant model's pricing as a first approximation.
      const dominant = models[0];
      const pricing = getPricing(dominant);
      const inputTokens = num(r.input_tokens);
      const outputTokens = num(r.output_tokens);
      const invocations = num(r.invocations);
      const llmCount = num(r.llm_count);
      const toolCount = num(r.tool_count);
      const cost = estimateCost(inputTokens, outputTokens, pricing);
      const costPerInvocation = invocations > 0 ? cost / invocations : 0;
      const hasLlmChild = llmCount > 0;
      const hasToolChild = toolCount > 0;
      const stage = computeStage(r);
      const ttftRaw = toNum(r.avg_ttft_ms);
      all.push({
        agent: r.agent,
        service: r.service ?? "",
        serviceId: r.service_id,
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
  }, [data, isLoading, error, servicesLoading, filters]);
};
