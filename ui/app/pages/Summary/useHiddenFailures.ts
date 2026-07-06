import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import {
  useResolvedServices,
  canQueryScope,
} from "../../scope/useResolvedServices";
import { extrapolate, useSampling } from "../../scope/SamplingContext";
import { buildHiddenFailuresQuery } from "./queries";

interface HiddenRecord {
  refusals?: number;
  truncations?: number;
  content_filters?: number;
  other?: number;
}

export interface HiddenCategory {
  key: string;
  label: string;
  count: number;
  color: string;
}

export interface HiddenFailures {
  categories: HiddenCategory[];
  total: number;
  isLoading: boolean;
  error?: Error;
}

/**
 * The "Hidden · 200-OK" donut source: HTTP-200 responses that are really
 * failures, split into refusals / max-token truncation / content-filter blocks
 * (plus an "other" provider/guardrail bucket when present). Counts are sampled
 * aggregates, so they extrapolate back to the unsampled population like the rest
 * of the app. Routes through useScopedDql → global timeframe, segments,
 * scan-limit, and the global trace filter all apply. Drills to Explorer.
 */
export const useHiddenFailures = (): HiddenFailures => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const resolution = useResolvedServices();
  const { serviceIds } = resolution;
  const canQuery = canQueryScope(resolution);

  const q = useScopedDql<HiddenRecord>(
    canQuery ? buildHiddenFailuresQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<HiddenFailures>(() => {
    const row = q.data?.records?.[0];
    const refusals = extrapolate(row?.refusals, samplingRatio) ?? 0;
    const truncations = extrapolate(row?.truncations, samplingRatio) ?? 0;
    const contentFilters =
      extrapolate(row?.content_filters, samplingRatio) ?? 0;
    const other = extrapolate(row?.other, samplingRatio) ?? 0;

    const categories: HiddenCategory[] = [
      { key: "refusals", label: "Refusals", count: refusals, color: "var(--red)" },
      {
        key: "truncations",
        label: "Max-token truncation",
        count: truncations,
        color: "var(--pink)",
      },
      {
        key: "content_filters",
        label: "Content-filter blocks",
        count: contentFilters,
        color: "var(--amber)",
      },
      { key: "other", label: "Other (provider / guardrail)", count: other, color: "var(--purple-2)" },
    ].filter((c) => c.count > 0);

    const total = categories.reduce((a, c) => a + c.count, 0);

    return {
      categories,
      total,
      isLoading: q.isLoading,
      error: q.error ?? undefined,
    };
  }, [q.data, q.isLoading, q.error, samplingRatio]);
};
