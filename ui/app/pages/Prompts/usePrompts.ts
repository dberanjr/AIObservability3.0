import { useCallback, useMemo, useState } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import { buildPromptsListQuery, buildPromptAgentMapQuery } from "./queries";
import { canonicalizeModel } from "../../detection/attributes";
import { toNum } from "../../data/format";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

const bool = (v: unknown): boolean => v === true || v === "true";

// Prompt/response content is usually a string, but some instrumentations emit
// gen_ai.input.messages / output.messages as a record or array — render those
// as pretty JSON so the table/popup still show something useful.
const str = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v == null) return "";
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
};

export type PromptKind = "LLM" | "Agent";

export interface PromptRow {
  id: string;
  timestampMs: number;
  kind: PromptKind;
  typeLabel: string;
  service: string;
  serviceId: string;
  provider: string | null;
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
  provider?: string | null;
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
  agents?: string[];
}

export interface PromptsFacets {
  services: Array<{ value: string; count: number }>;
  models: Array<{ value: string; count: number }>;
  agents: Array<{ value: string; count: number }>;
  kinds: Array<{ value: PromptKind; count: number }>;
}

export interface UsePromptsResult {
  prompts: PromptRow[];
  filtered: PromptRow[];
  facets: PromptsFacets;
  isLoading: boolean;
  error?: Error;
  refetch: () => void;
  /**
   * True when at least one row carries prompt/response text. In tenants that
   * don't instrument prompt/completion content this is false and the page
   * shows a "metadata-only" notice instead of pretending content exists.
   */
  hasContent: boolean;
  /** True when any eval score (hallucination/correctness/…) is present. */
  hasEval: boolean;
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

  // Service / kind / search facets are applied SERVER-SIDE so the 200-row cap
  // is taken after filtering (model/agent stay client-side below). The query
  // therefore varies with those facets and refetches when they change.
  const sidebar = {
    services: filter.services,
    kinds: filter.kinds,
    search: filter.search,
  };
  const query = useMemo(
    () =>
      canQuery
        ? buildPromptsListQuery(
            resolution.serviceIds,
            scope.timeframe,
            filters,
            sidebar,
          ) + ` /* r${refreshKey} */`
        : "",
    [
      canQuery,
      resolution.serviceIds,
      scope.timeframe,
      refreshKey,
      filter.services?.join(","),
      filter.kinds?.join(","),
      filter.search,
    ],
  );

  const { data, isLoading, error } = useScopedDql<PromptRecord>(query, {
    enabled: canQuery,
    staleTime: 60_000,
  });

  // Trace → agent map: LLM-call spans carry no agent name, so resolve the
  // owning agent per trace.id and backfill it. Opts out of global filtering so
  // an agent filter doesn't drop the LLM spans we're trying to attribute.
  const { data: agentMapData } = useScopedDql<{ trace_id?: string; agent?: string }>(
    canQuery ? buildPromptAgentMapQuery(resolution.serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000, ignoreGlobalFilter: true },
  );

  return useMemo<UsePromptsResult>(() => {
    const traceAgent = new Map<string, string>();
    for (const m of agentMapData?.records ?? []) {
      if (typeof m.trace_id === "string" && typeof m.agent === "string") {
        traceAgent.set(m.trace_id, m.agent);
      }
    }

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
        provider: r.provider ?? null,
        model: r.model ? canonicalizeModel(r.model).label : null,
        agent:
          r.agent ?? (traceId ? traceAgent.get(traceId) ?? null : null),
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
    const agentCounts = countBy(prompts, (r) => r.agent);
    const kindCounts = countBy(prompts, (r) => r.kind);

    const hasContent = prompts.some(
      (p) => p.promptText.length > 0 || p.responseText.length > 0,
    );
    const hasEval = prompts.some(
      (p) =>
        p.evalHallucination != null ||
        p.evalCorrectness != null ||
        p.evalFaithfulness != null ||
        p.evalRelevance != null,
    );

    const search = filter.search?.trim().toLowerCase() ?? "";
    const kinds = filter.kinds ?? [];
    const services = filter.services ?? [];
    const models = filter.models ?? [];
    const agents = filter.agents ?? [];

    const filtered = prompts.filter((p) => {
      if (kinds.length > 0 && !kinds.includes(p.kind)) return false;
      if (services.length > 0 && !services.includes(p.service)) return false;
      if (models.length > 0 && (!p.model || !models.includes(p.model))) return false;
      if (agents.length > 0 && (!p.agent || !agents.includes(p.agent))) return false;
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
        agents: Array.from(agentCounts.entries())
          .filter(([value]) => value && value.length > 0)
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count),
        kinds: (["LLM", "Agent"] as const).map<{ value: PromptKind; count: number }>((k) => ({
          value: k,
          count: kindCounts.get(k) ?? 0,
        })),
      },
      hasContent,
      hasEval,
      isLoading: resolution.isLoading || isLoading,
      error: error ?? undefined,
      refetch,
    };
  }, [
    data,
    agentMapData,
    isLoading,
    error,
    resolution.isLoading,
    filter?.search,
    filter?.kinds?.join(","),
    filter?.services?.join(","),
    filter?.models?.join(","),
    filter?.agents?.join(","),
    refetch,
  ]);
};
