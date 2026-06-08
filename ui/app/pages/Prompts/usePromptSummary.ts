import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import { buildPromptsSummaryQuery } from "./queries";
import { toNum } from "../../data/format";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

interface SummaryRecord {
  total?: number;
  avg_duration_ms?: number;
  avg_input_tokens?: number;
  avg_output_tokens?: number;
  pii_detected?: number;
  warnings?: number;
  errors?: number;
  truncated?: number;
}

export interface PromptSummary {
  total: number;
  /** Approximate displayed sample size — the prompts list is capped at 200. */
  sampleSize: number;
  avgDurationMs: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  piiDetected: number;
  warnings: number;
  errors: number;
  truncated: number;
  isLoading: boolean;
  error?: Error;
}

export const SAMPLE_SIZE = 200;

export const usePromptSummary = (): PromptSummary => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const { filters } = useGlobalFilters();
  const canQuery = canQueryScope(resolution);

  const { data, isLoading, error } = useScopedDql<SummaryRecord>(
    canQuery ? buildPromptsSummaryQuery(resolution.serviceIds, scope.timeframe, filters) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<PromptSummary>(() => {
    const row = data?.records?.[0];
    const total = num(row?.total);
    return {
      total,
      sampleSize: Math.min(SAMPLE_SIZE, total),
      avgDurationMs: num(row?.avg_duration_ms),
      avgInputTokens: num(row?.avg_input_tokens),
      avgOutputTokens: num(row?.avg_output_tokens),
      piiDetected: num(row?.pii_detected),
      warnings: num(row?.warnings),
      errors: num(row?.errors),
      truncated: num(row?.truncated),
      isLoading: resolution.isLoading || isLoading,
      error: error ?? undefined,
    };
  }, [data, isLoading, error, resolution.isLoading]);
};
