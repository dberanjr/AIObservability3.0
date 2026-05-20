import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { buildAgentCostQuery } from "./dataQueries";
import { estimateCost, getPricing } from "../../data/pricing";

interface AgentRecord {
  agent?: string;
  model?: string;
  invocations?: number;
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
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const canQuery = canQueryScope(_resolution);

  const { data, isLoading, error } = useScopedDql<AgentRecord>(
    canQuery ? buildAgentCostQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<UseAgentCostsResult>(() => {
    const byAgent = new Map<string, AgentCost>();
    for (const r of data?.records ?? []) {
      if (!r.agent) continue;
      const pricing = getPricing(r.model);
      const inTok = r.input_tokens ?? 0;
      const outTok = r.output_tokens ?? 0;
      const cost = estimateCost(inTok, outTok, pricing);
      const existing = byAgent.get(r.agent);
      if (existing) {
        existing.invocations += r.invocations ?? 0;
        existing.inputTokens += inTok;
        existing.outputTokens += outTok;
        existing.tokens += inTok + outTok;
        existing.cost += cost;
        if (r.model && !existing.models.includes(r.model)) {
          existing.models.push(r.model);
        }
      } else {
        byAgent.set(r.agent, {
          agent: r.agent,
          invocations: r.invocations ?? 0,
          inputTokens: inTok,
          outputTokens: outTok,
          tokens: inTok + outTok,
          cost,
          models: r.model ? [r.model] : [],
        });
      }
    }
    const rows = Array.from(byAgent.values()).sort((a, b) => b.cost - a.cost);
    const totalCost = rows.reduce((acc, r) => acc + r.cost, 0);
    return {
      rows,
      totalCost,
      isLoading: servicesLoading || isLoading,
      error: error ?? undefined,
    };
  }, [data, isLoading, error, servicesLoading]);
};
