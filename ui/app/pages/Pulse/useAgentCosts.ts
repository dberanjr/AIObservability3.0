import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { useSampling } from "../../scope/SamplingContext";
import { buildAgentTraceJoinQuery } from "../Agents/queries";
import { costOf } from "../../data/pricing";
import { canonicalizeModel } from "../../detection/attributes";

interface AgentRecord {
  agent?: string;
  models?: Array<string | null>;
  linked_traces?: number;
  input_tokens?: number;
  output_tokens?: number;
}

export interface AgentCost {
  agent: string;
  invocations: number;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  cost: number;
  models: string[];
}

export interface UseAgentCostsResult {
  rows: AgentCost[];
  totalCost: number;
  isLoading: boolean;
  error?: Error;
}

export const useAgentCosts = (): UseAgentCostsResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const canQuery = canQueryScope(_resolution);

  // Agent spans carry no tokens in this tenant (LLM calls run through the
  // central proxy), so the only way to cost an agent is the trace-join: LLM
  // token usage that shares a trace.id with the agent. Respects the global
  // filter, which is now trace-scoped — that keeps both agent and LLM spans for
  // in-scope traces (unlike the old span-attribute filter), so the join still
  // works. Agents whose LLM calls run in separate traces won't appear.
  const { data, isLoading, error } = useScopedDql<AgentRecord>(
    canQuery ? buildAgentTraceJoinQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<UseAgentCostsResult>(() => {
    const byAgent = new Map<string, AgentCost>();
    for (const r of data?.records ?? []) {
      if (!r.agent) continue;
      const rawModels = (r.models ?? []).filter(
        (m): m is string => typeof m === "string" && m.length > 0,
      );
      // Extrapolate token sums back to the unsampled population; cost derives
      // from the extrapolated figures, via the cache-aware cost model.
      const inTok = (r.input_tokens ?? 0) * samplingRatio;
      const outTok = (r.output_tokens ?? 0) * samplingRatio;
      const invocations = (r.linked_traces ?? 0) * samplingRatio;
      const cost = costOf(inTok, outTok, rawModels[0]);
      const models = Array.from(
        new Set(rawModels.map((m) => canonicalizeModel(m).label)),
      );
      byAgent.set(r.agent, {
        agent: r.agent,
        invocations,
        inputTokens: inTok,
        outputTokens: outTok,
        tokens: inTok + outTok,
        cost,
        models,
      });
    }
    const rows = Array.from(byAgent.values()).sort((a, b) => b.cost - a.cost);
    const totalCost = rows.reduce((acc, r) => acc + r.cost, 0);
    return {
      rows,
      totalCost,
      isLoading: servicesLoading || isLoading,
      error: error ?? undefined,
    };
  }, [data, isLoading, error, servicesLoading, samplingRatio]);
};
