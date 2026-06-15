import { useCallback, useMemo, useState } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import {
  buildPromptsListQuery,
  buildPromptAgentMapQuery,
  buildPromptFacetValuesQuery,
  type LatencyFilter,
} from "./queries";
import { canonicalizeModel } from "../../detection/attributes";
import { costOf } from "../../data/pricing";
import { toNum } from "../../data/format";

/** True when `val` satisfies a numeric range filter (>, <, between). */
const matchRange = (val: number, r?: LatencyFilter): boolean => {
  if (!r) return true;
  if (r.op === "gt") return r.min == null || val > r.min;
  if (r.op === "lt") return r.max == null || val < r.max;
  if (r.op === "between")
    return (r.min == null || val >= r.min) && (r.max == null || val <= r.max);
  return true;
};

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
  temperature: number | null;
  inTokens: number;
  outTokens: number;
  /** Estimated cost in cents (tokens × per-model pricing). */
  inCost: number;
  outCost: number;
  durationMs: number;
  promptText: string;
  responseText: string;
  systemPrompt: string | null;
  piiDetected: boolean;
  hasWarning: boolean;
  hasError: boolean;
  /** Response was cut off by the max-tokens limit. */
  truncated: boolean;
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
  temperature?: number | null;
  in_tok?: number;
  out_tok?: number;
  duration_ms?: number;
  prompt_text?: string;
  response_text?: string;
  system_prompt?: string | null;
  pii_detected?: boolean | string;
  has_warning?: boolean | string;
  has_error?: boolean | string;
  truncated?: boolean | string;
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

export type { LatencyFilter };

export interface PromptsFilter {
  search?: string;
  kinds?: PromptKind[];
  services?: string[];
  models?: string[];
  agents?: string[];
  providers?: string[];
  operations?: string[];
  onlyErrors?: boolean;
  onlyPii?: boolean;
  onlyWarnings?: boolean;
  onlyTruncated?: boolean;
  latency?: LatencyFilter;
  temperature?: LatencyFilter;
  /** Cost range filters, in dollars (applied client-side over loaded rows). */
  inCost?: LatencyFilter;
  outCost?: LatencyFilter;
}

export interface FacetValue {
  value: string;
  count?: number;
}

export interface PromptsFacets {
  services: FacetValue[];
  models: FacetValue[];
  agents: FacetValue[];
  providers: FacetValue[];
  operations: FacetValue[];
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
    providers: filter.providers,
    operations: filter.operations,
    onlyErrors: filter.onlyErrors,
    onlyPii: filter.onlyPii,
    onlyWarnings: filter.onlyWarnings,
    onlyTruncated: filter.onlyTruncated,
    latency: filter.latency,
    temperature: filter.temperature,
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
      filter.providers?.join(","),
      filter.operations?.join(","),
      filter.onlyErrors,
      filter.onlyPii,
      filter.onlyWarnings,
      filter.onlyTruncated,
      filter.latency?.op,
      filter.latency?.min,
      filter.latency?.max,
      filter.temperature?.op,
      filter.temperature?.min,
      filter.temperature?.max,
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

  // Sidebar facet OPTIONS, discovered server-side across all AI spans (not just
  // the 200 content rows). Ignores the global filter so the option lists stay
  // complete/discoverable. Fixes the previously-empty Agent facet.
  const { data: facetData } = useScopedDql<{
    agents?: unknown;
    models?: unknown;
    providers?: unknown;
    operations?: unknown;
    services?: unknown;
  }>(
    canQuery ? buildPromptFacetValuesQuery(resolution.serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 300_000, ignoreGlobalFilter: true },
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

      const modelLabel = r.model ? canonicalizeModel(r.model).label : null;
      const inTok = num(r.in_tok);
      const outTok = num(r.out_tok);
      const inCost = inTok > 0 ? costOf(inTok, 0, modelLabel) : 0;
      const outCost = outTok > 0 ? costOf(0, outTok, modelLabel) : 0;

      prompts.push({
        id: spanId ?? `${traceId ?? "?"}-${prompts.length}`,
        timestampMs: parseTimestamp(r.timestamp),
        kind: r.kind === "Agent" ? "Agent" : "LLM",
        typeLabel: str(r.type_label) || "completion",
        service: str(r.service),
        serviceId: str(r.service_id),
        provider: r.provider ?? null,
        model: modelLabel,
        agent:
          r.agent ?? (traceId ? traceAgent.get(traceId) ?? null : null),
        temperature:
          typeof r.temperature === "number" ? r.temperature : null,
        inTokens: inTok,
        outTokens: outTok,
        inCost,
        outCost,
        durationMs: num(r.duration_ms),
        promptText: str(r.prompt_text),
        responseText: str(r.response_text),
        systemPrompt: r.system_prompt ?? null,
        piiDetected: bool(r.pii_detected),
        hasWarning: bool(r.has_warning),
        hasError: bool(r.has_error),
        truncated: bool(r.truncated),
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
    const providerCounts = countBy(prompts, (r) => r.provider);
    const operationCounts = countBy(prompts, (r) => r.typeLabel);
    const kindCounts = countBy(prompts, (r) => r.kind);

    // collectDistinct() yields a JS array of strings (or null entries).
    const arr = (v: unknown): string[] =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string" && x.length > 0)
        : [];
    const fr = facetData?.records?.[0];
    const discoveredModels = Array.from(
      new Set(arr(fr?.models).map((m) => canonicalizeModel(m).label)),
    );

    // Merge server-discovered option values with client-row counts. Values only
    // seen server-side show no count; counts sort the list, then alpha.
    const mergeFacet = (
      discovered: string[],
      counts: Map<string, number>,
    ): FacetValue[] => {
      const values = new Set<string>([
        ...discovered,
        ...Array.from(counts.keys()).filter(
          (v): v is string => typeof v === "string" && v.length > 0,
        ),
      ]);
      return Array.from(values)
        .map((value) => ({ value, count: counts.get(value) }))
        .sort(
          (a, b) =>
            (b.count ?? 0) - (a.count ?? 0) || a.value.localeCompare(b.value),
        );
    };

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
      // Cost filters are in dollars; PromptRow stores cents.
      if (!matchRange(p.inCost / 100, filter.inCost)) return false;
      if (!matchRange(p.outCost / 100, filter.outCost)) return false;
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
        services: mergeFacet(arr(fr?.services), serviceCounts),
        models: mergeFacet(discoveredModels, modelCounts),
        agents: mergeFacet(arr(fr?.agents), agentCounts),
        providers: mergeFacet(arr(fr?.providers), providerCounts),
        operations: mergeFacet(arr(fr?.operations), operationCounts),
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
    facetData,
    isLoading,
    error,
    resolution.isLoading,
    filter?.search,
    filter?.kinds?.join(","),
    filter?.services?.join(","),
    filter?.models?.join(","),
    filter?.agents?.join(","),
    filter?.inCost?.op,
    filter?.inCost?.min,
    filter?.inCost?.max,
    filter?.outCost?.op,
    filter?.outCost?.min,
    filter?.outCost?.max,
    refetch,
  ]);
};
