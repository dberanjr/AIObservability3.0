import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { buildAgentEvalQuery } from "./queries";

interface EvalRecord {
  invocations?: number;
  correctness_pct?: number | null;
  hallucination_pct?: number | null;
  success_pct?: number | null;
  avg_ctx_tokens?: number | null;
  with_correctness?: number;
  with_halluc?: number;
  with_success?: number;
}

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

export const useAgentEval = (): AgentEvalSnapshot => {
  const { scope } = useScope();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const canQuery = canQueryScope(_resolution);

  const { data, isLoading, error } = useScopedDql<EvalRecord>(
    canQuery ? buildAgentEvalQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<AgentEvalSnapshot>(() => {
    const row = data?.records?.[0];
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
      isLoading: servicesLoading || isLoading,
      error: error ?? undefined,
    };
  }, [data, isLoading, error, servicesLoading]);
};
