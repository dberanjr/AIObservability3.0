import { useCallback, useMemo, useState } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import { buildPromptsListQuery } from "./queries";
import { toNum } from "../../data/format";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

const bool = (v: unknown): boolean => v === true || v === "true";

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export type PromptKind = "LLM" | "Agent";

export interface PromptRow {
  id: string;
  timestampMs: number;
  kind: PromptKind;
  typeLabel: string;
  service: string;
  serviceId: string;
  model: string | null;
  agent: string | null;
  inTokens: number;
  outTokens: number;
  durationMs: number;
  promptText: string;
  responseText: string;
  systemPrompt: string | null;
  piiDetected: boolean;
  hasWarning: boolean;
  hasError: boolean;
  evalHallucination: number | null;
  evalCorrectness: number | null;
  evalFaithfulness: number | null;
  evalRelevance: number | null;
  traceId: string | null;
  spanId: string | null;
}

interface PromptRecord {
  timestamp?: string | number;
  kind?: string;
  type_label?: string;
  service?: string;
  service_id?: string;
  model?: string | null;
  agent?: string | null;
  in_tok?: number;
  out_tok?: number;
  duration_ms?: number;
  prompt_text?: string;
  response_text?: string;
  system_prompt?: string | null;
  pii_detected?: boolean | string;
  has_warning?: boolean | string;
  has_error?: boolean | string;
  eval_hallucination?: number | null;
  eval_correctness?: number | null;
  eval_faithfulness?: number | null;
  eval_relevance?: number | null;
  trace_id?: string | null;
  span_id?: string | null;
}

const parseTimestamp = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const parsed = Date.parse(v);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
};

export interface PromptsFilter {
  search?: string;
  kinds?: PromptKind[];
  services?: string[];
  models?: string[];
}

export interface PromptsFacets {
  services: Array<{ value: string; count: number }>;
  models: Array<{ value: string; count: number }>;
  kinds: Array<{ value: PromptKind; count: number }>;
}

export interface UsePromptsResult {
  prompts: PromptRow[];
  filtered: PromptRow[];
  facets: PromptsFacets;
  isLoading: boolean;
  error?: Error;
  refetch: () => void;
}

const countBy = <T>(
  rows: PromptRow[],
  pick: (r: PromptRow) => T | null | undefined,
) => {
  const counts = new Map<T, number>();
  for (const r of rows) {
    const v = pick(r);
    if (v == null) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
};

export const usePrompts = (filter: PromptsFilter = {}): UsePromptsResult => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const { filters } = useGlobalFilters();
  const canQuery = canQueryScope(resolution);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const query = useMemo(
    () =>
      canQuery
        ? buildPromptsListQuery(resolution.serviceIds, scope.timeframe, filters) +
          ` /* r${refreshKey} */`
        : "",
    [canQuery, resolution.serviceIds, scope.timeframe, filters, refreshKey],
  );

  const { data, isLoading, error } = useScopedDql<PromptRecord>(query, {
    enabled: canQuery,
    staleTime: 60_000,
  });

  return useMemo<UsePromptsResult>(() => {
    const prompts: PromptRow[] = [];
    for (const r of data?.records ?? []) {
      const spanId = typeof r.span_id === "string" ? r.span_id : null;
      const traceId = typeof r.trace_id === "string" ? r.trace_id : null;
      const evalHallucination =
        typeof r.eval_hallucination === "number"
          ? r.eval_hallucination
          : null;
      const evalCorrectness =
        typeof r.eval_correctness === "number" ? r.eval_correctness : null;
      const evalFaithfulness =
        typeof r.eval_faithfulness === "number"
          ? r.eval_faithfulness
          : null;
      const evalRelevance =
        typeof r.eval_relevance === "number" ? r.eval_relevance : null;

      prompts.push({
        id: spanId ?? `${traceId ?? "?"}-${prompts.length}`,
        timestampMs: parseTimestamp(r.timestamp),
        kind: r.kind === "Agent" ? "Agent" : "LLM",
        typeLabel: str(r.type_label) || "completion",
        service: str(r.service),
        serviceId: str(r.service_id),
        model: r.model ?? null,
        agent: r.agent ?? null,
        inTokens: num(r.in_tok),
        outTokens: num(r.out_tok),
        durationMs: num(r.duration_ms),
        promptText: str(r.prompt_text),
        responseText: str(r.response_text),
        systemPrompt: r.system_prompt ?? null,
        piiDetected: bool(r.pii_detected),
        hasWarning: bool(r.has_warning),
        hasError: bool(r.has_error),
        evalHallucination,
        evalCorrectness,
        evalFaithfulness,
        evalRelevance,
        traceId,
        spanId,
      });
    }

    const serviceCounts = countBy(prompts, (r) => r.service);
    const modelCounts = countBy(prompts, (r) => r.model);
    const kindCounts = countBy(prompts, (r) => r.kind);

    const search = filter.search?.trim().toLowerCase() ?? "";
    const kindSet = new Set(filter.kinds ?? []);
    const serviceSet = new Set(filter.services ?? []);
    const modelSet = new Set(filter.models ?? []);

    const filtered = prompts.filter((p) => {
      if (kindSet.size > 0 && !kindSet.has(p.kind)) return false;
      if (serviceSet.size > 0 && !serviceSet.has(p.service)) return false;
      if (modelSet.size > 0 && (!p.model || !modelSet.has(p.model))) return false;
      if (search) {
        const hay =
          `${p.promptText} ${p.responseText} ${p.service} ${p.model ?? ""} ${p.agent ?? ""}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    return {
      prompts,
      filtered,
      facets: {
        services: Array.from(serviceCounts.entries())
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count),
        models: Array.from(modelCounts.entries())
          .filter(([value]) => value && value.length > 0)
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count),
        kinds: (["LLM", "Agent"] as const).map<{ value: PromptKind; count: number }>((k) => ({
          value: k,
          count: kindCounts.get(k) ?? 0,
        })),
      },
      isLoading: resolution.isLoading || isLoading,
      error: error ?? undefined,
      refetch,
    };
  }, [
    data,
    isLoading,
    error,
    resolution.isLoading,
    filter.search,
    filter.kinds,
    filter.services,
    filter.models,
    refetch,
  ]);
};
