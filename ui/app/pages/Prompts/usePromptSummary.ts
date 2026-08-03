import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import { buildPromptsSummaryQuery } from "./queries";
import { toSidebar } from "./filterScope";
import type { PromptsFilter } from "./usePrompts";
import { DEMO_PROMPT_SUMMARY_RAW } from "./demoData";
import { SAMPLE_SIZE, buildPromptSummary } from "./promptsParse";

export interface SummaryRecord {
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

// `SAMPLE_SIZE` and `buildPromptSummary` (aggregate query row → KPI totals)
// live in `./promptsParse` — a dependency-free pure module — so both this
// hook and the Demo Mode dataset can share them without either importing the
// other's Context-dependent runtime code. Re-exported for anything that
// still imports them from this hook file (e.g. PromptsTable, PromptsTilesRow).
export { SAMPLE_SIZE, buildPromptSummary };

export const usePromptSummary = (
  filter?: PromptsFilter,
  focus?: string | null,
  /** True to render the bundled Demo Mode aggregate instead of querying Grail. */
  showExample = false,
): PromptSummary => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const { filters } = useGlobalFilters();
  const canQuery = canQueryScope(resolution);

  const { data, isLoading, error } = useScopedDql<SummaryRecord>(
    canQuery
      ? buildPromptsSummaryQuery(
          resolution.serviceIds,
          scope.timeframe,
          filters,
          toSidebar(filter),
          focus,
        )
      : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  return useMemo<PromptSummary>(() => {
    if (showExample) {
      return { ...buildPromptSummary(DEMO_PROMPT_SUMMARY_RAW), isLoading: false, error: undefined };
    }
    const row = data?.records?.[0];
    return {
      ...buildPromptSummary(row),
      isLoading: resolution.isLoading || isLoading,
      error: error ?? undefined,
    };
  }, [data, isLoading, error, resolution.isLoading, showExample]);
};
