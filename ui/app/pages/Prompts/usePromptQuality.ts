import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import { buildPromptQualityQuery } from "./queries";
import { toNum } from "../../data/format";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

const optionalPct = (v: unknown): number | null => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : null;
};

interface QualityRecord {
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

export const usePromptQuality = (): PromptQuality => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);

  const { data, isLoading, error } = useScopedDql<QualityRecord>(
    canQuery ? buildPromptQualityQuery(resolution.serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<PromptQuality>(() => {
    const row = data?.records?.[0];
    const hallucCov = num(row?.with_halluc);
    const correctCov = num(row?.with_correct);
    const faithCov = num(row?.with_faith);
    const relCov = num(row?.with_rel);
    const hasAnyEval =
      hallucCov + correctCov + faithCov + relCov > 0;

    return {
      totalLlmSpans: num(row?.total),
      hallucination: {
        pct: hallucCov === 0 ? null : optionalPct(row?.hallucination_pct),
        coverage: hallucCov,
        attribute: "gen_ai.evaluation.hallucination",
      },
      correctness: {
        pct: correctCov === 0 ? null : optionalPct(row?.correctness_pct),
        coverage: correctCov,
        attribute: "gen_ai.evaluation.correctness",
      },
      faithfulness: {
        pct: faithCov === 0 ? null : optionalPct(row?.faithfulness_pct),
        coverage: faithCov,
        attribute: "gen_ai.evaluation.faithfulness",
      },
      relevance: {
        pct: relCov === 0 ? null : optionalPct(row?.relevance_pct),
        coverage: relCov,
        attribute: "gen_ai.evaluation.relevance",
      },
      hasAnyEval,
      isLoading: resolution.isLoading || isLoading,
      error: error ?? undefined,
    };
  }, [data, isLoading, error, resolution.isLoading]);
};
