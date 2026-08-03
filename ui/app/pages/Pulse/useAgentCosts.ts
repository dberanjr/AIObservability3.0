import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { useSampling } from "../../scope/SamplingContext";
import { buildAgentTraceJoinQuery } from "../Agents/queries";
import {
  computeAgentCosts,
  type AgentTraceJoinRecord,
  type AgentCost,
} from "./parse";
import { DEMO_AGENT_COSTS } from "./demoData";

export type { AgentCost };
export type AgentRecord = AgentTraceJoinRecord;

export interface UseAgentCostsResult {
  rows: AgentCost[];
  totalCost: number;
  isLoading: boolean;
  error?: Error;
}

/**
 * `showExample` (default false, mirrors useGuardrails.ts) renders the Demo
 * Mode dataset instead of querying Grail — used by the Summary page's
 * TopAgentsCard. Pulse's own AgentCostBarList never passes it, so its
 * behavior is unchanged.
 */
export const useAgentCosts = (showExample = false): UseAgentCostsResult => {
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
  const { data, isLoading, error } = useScopedDql<AgentTraceJoinRecord>(
    canQuery ? buildAgentTraceJoinQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  return useMemo<UseAgentCostsResult>(() => {
    if (showExample) {
      return { ...DEMO_AGENT_COSTS, isLoading: false, error: undefined };
    }
    const core = computeAgentCosts(data?.records ?? [], samplingRatio);
    return {
      ...core,
      isLoading: servicesLoading || isLoading,
      error: error ?? undefined,
    };
  }, [showExample, data, isLoading, error, servicesLoading, samplingRatio]);
};
