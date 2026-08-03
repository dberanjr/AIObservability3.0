import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { buildAgentsQuery, buildAgentTraceJoinQuery } from "./queries";
import {
  parseAgentRows,
  type AgentRecord,
  type TraceJoinRecord,
  type AgentRow,
  type StageBreakdown,
} from "./parse";
import { DEMO_AGENTS } from "./demoData";

export type { AgentRow, StageBreakdown };

export interface UseAgentsResult {
  substantive: AgentRow[];
  orchestration: AgentRow[];
  all: AgentRow[];
  isLoading: boolean;
  error?: Error;
}

/**
 * @param showExample Demo Mode / no-telemetry fallback — see BedrockPage's
 * doc comment for the pattern. When true, both real queries are skipped and
 * the canned `DEMO_AGENTS` fleet (see ./demoData.ts) is returned instead.
 */
export const useAgents = (showExample = false): UseAgentsResult => {
  const { scope } = useScope();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const { filters } = useGlobalFilters();
  const canQuery = canQueryScope(_resolution);

  const { data, isLoading, error } = useScopedDql<AgentRecord>(
    canQuery && !showExample ? buildAgentsQuery(serviceIds, scope.timeframe, filters) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  // Secondary query: attribute LLM cost/operations to agents via trace.id.
  // Respects the global filter, which is now trace-scoped (in(trace.id, …)):
  // that keeps BOTH agent and LLM (null-agent) spans for in-scope traces, so it
  // no longer breaks the join the way the old span-attribute filter did.
  const { data: joinData } = useScopedDql<TraceJoinRecord>(
    canQuery && !showExample ? buildAgentTraceJoinQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  return useMemo<UseAgentsResult>(() => {
    if (showExample) {
      return {
        all: DEMO_AGENTS,
        substantive: DEMO_AGENTS.filter((a) => !a.isOrchestration),
        orchestration: DEMO_AGENTS.filter((a) => a.isOrchestration),
        isLoading: false,
        error: undefined,
      };
    }
    const all = parseAgentRows(data?.records ?? [], joinData?.records ?? []);
    return {
      all,
      substantive: all.filter((a) => !a.isOrchestration),
      orchestration: all.filter((a) => a.isOrchestration),
      isLoading: servicesLoading || isLoading,
      error: error ?? undefined,
    };
  }, [showExample, data, joinData, isLoading, error, servicesLoading, filters]);
};
