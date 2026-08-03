import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import { buildPromptQualityQuery } from "./queries";
import { toSidebar } from "./filterScope";
import type { PromptsFilter } from "./usePrompts";
import { DEMO_PROMPT_QUALITY_RAW } from "./demoData";
import { buildPromptQuality } from "./promptsParse";

export interface QualityRecord {
  total?: number;
  hallucination_pct?: number | null;
  correctness_pct?: number | null;
  faithfulness_pct?: number | null;
  relevance_pct?: number | null;
  with_halluc?: number;
  with_correct?: number;
  with_faith?: number;
  with_rel?: number;
}

export interface QualityMetricSnapshot {
  /** Average score, percent. Null when no spans carry the attribute. */
  pct: number | null;
  /** Number of spans that carried this attribute. */
  coverage: number;
  /** OTel-style attribute path the user needs to instrument. */
  attribute: string;
}

export interface PromptQuality {
  totalLlmSpans: number;
  hallucination: QualityMetricSnapshot;
  correctness: QualityMetricSnapshot;
  faithfulness: QualityMetricSnapshot;
  relevance: QualityMetricSnapshot;
  hasAnyEval: boolean;
  isLoading: boolean;
  error?: Error;
}

// `buildPromptQuality` (aggregate query row → quality panel snapshot) lives
// in `./promptsParse` — a dependency-free pure module — so both this hook
// and the Demo Mode dataset can share it without either importing the
// other's Context-dependent runtime code. Re-exported for anything that
// still imports it from this hook file.
export { buildPromptQuality };

export const usePromptQuality = (
  filter?: PromptsFilter,
  focus?: string | null,
  /** True to render the bundled Demo Mode aggregate instead of querying Grail. */
  showExample = false,
): PromptQuality => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const { filters } = useGlobalFilters();
  const canQuery = canQueryScope(resolution);

  const { data, isLoading, error } = useScopedDql<QualityRecord>(
    canQuery
      ? buildPromptQualityQuery(
          resolution.serviceIds,
          scope.timeframe,
          filters,
          toSidebar(filter),
          focus,
        )
      : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  return useMemo<PromptQuality>(() => {
    if (showExample) {
      return { ...buildPromptQuality(DEMO_PROMPT_QUALITY_RAW), isLoading: false, error: undefined };
    }
    const row = data?.records?.[0];
    return {
      ...buildPromptQuality(row),
      isLoading: resolution.isLoading || isLoading,
      error: error ?? undefined,
    };
  }, [data, isLoading, error, resolution.isLoading, showExample]);
};
