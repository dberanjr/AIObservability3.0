import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { buildAgentEvalQuery } from "./queries";
import { parseAgentEvalCore, type EvalRecord } from "./parse";
import { DEMO_AGENT_EVAL } from "./demoData";

export interface AgentEvalSnapshot {
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
  isLoading: boolean;
  error?: Error;
}

/**
 * @param showExample Demo Mode / no-telemetry fallback — see BedrockPage's
 * doc comment. Returns the canned `DEMO_AGENT_EVAL` instead of querying.
 */
export const useAgentEval = (showExample = false): AgentEvalSnapshot => {
  const { scope } = useScope();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const { filters } = useGlobalFilters();
  const canQuery = canQueryScope(_resolution);

  const { data, isLoading, error } = useScopedDql<EvalRecord>(
    canQuery && !showExample ? buildAgentEvalQuery(serviceIds, scope.timeframe, filters) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  return useMemo<AgentEvalSnapshot>(() => {
    if (showExample) {
      return { ...DEMO_AGENT_EVAL, isLoading: false, error: undefined };
    }
    const core = parseAgentEvalCore(data?.records?.[0]);
    return {
      ...core,
      isLoading: servicesLoading || isLoading,
      error: error ?? undefined,
    };
  }, [showExample, data, isLoading, error, servicesLoading, filters]);
};
