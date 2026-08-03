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
import { injectTraceScope } from "../../scope/queries";
import { useFocusTraceScope } from "./useFocusTraceScope";
import { matchEvalFilter, type EvalFilter } from "./evalTable";
import { serverSortClause, type PromptSort } from "./promptsSort";
import { RAW_DEMO_PROMPT_RECORDS, DEMO_TRACE_AGENT_MAP } from "./demoData";
import { parsePromptRecords } from "./promptsParse";

/** True when `val` satisfies a numeric range filter (>, <, between). */
const matchRange = (val: number, r?: LatencyFilter): boolean => {
  if (!r) return true;
  if (r.op === "gt") return r.min == null || val > r.min;
  if (r.op === "lt") return r.max == null || val < r.max;
  if (r.op === "between")
    return (r.min == null || val >= r.min) && (r.max == null || val <= r.max);
  return true;
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

export interface PromptRecord {
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
  /**
   * Eval-score range filter (Prompts-4). Set by clicking a quality-panel metric
   * tile to drill into the spans failing that metric. Applied client-side over
   * the loaded rows (the eval scores are already on every PromptRow).
   */
  eval?: EvalFilter;
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

// `parsePromptRecords` (raw DQL row → PromptRow, backfilling the agent name
// from the trace→agent join) lives in `./promptsParse` — a dependency-free
// pure module — so both this hook and the Demo Mode dataset can share it
// without either importing the other's Context-dependent runtime code.
// Re-exported here for anything that still imports it from this hook file.
export { parsePromptRecords };

/**
 * Precomputed once at module load — the SAME `parsePromptRecords` the real
 * query path uses (above), run over demoData's raw fixture set. Demo Mode
 * queries nothing, so this is what `usePrompts` renders in that case.
 */
const DEMO_PROMPT_ROWS: PromptRow[] = parsePromptRecords(
  RAW_DEMO_PROMPT_RECORDS,
  DEMO_TRACE_AGENT_MAP,
);

export const usePrompts = (
  filter: PromptsFilter = {},
  /** Raw `?focus` id from a Pulse problem-pattern drill-down (PP-3). */
  focus?: string | null,
  /**
   * Active table sort. A heavy numeric column (tokens / duration) is lifted
   * server-side so the fetched 200-row sample is the TRUE top-N (Prompts-9);
   * cost / temperature / timestamp sorts leave the query unchanged and are
   * reordered over the sample client-side.
   */
  sort?: PromptSort,
  /**
   * True to render the bundled Demo Mode dataset instead of querying Grail —
   * either the global Demo Mode Tweak or this page's own no-telemetry
   * fallback (see PromptsPage). Every query below is skipped and every
   * derived value (facets, hasContent/hasEval, client-side filtering) is
   * computed over `DEMO_PROMPT_ROWS` instead, so the table/tiles/quality
   * panel all stay internally consistent.
   */
  showExample = false,
): UsePromptsResult => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const { filters } = useGlobalFilters();
  const canQuery = canQueryScope(resolution);
  const [refreshKey, setRefreshKey] = useState(0);

  // CROSS-SPAN focus (PP-4): tool-retry-storm / agent-n1-tool-calls /
  // vdb-topk-over-retrieval / mem-history-growth define their pattern on the
  // tool/state span, not the LLM/prompt span this page reads. Resolve the
  // matching trace.ids and scope the list to those traces (injectTraceScope).
  // Same-span focuses (the LLM ones + tool-token-spike) leave this inert and
  // use the synchronous predicate path in buildPromptsListQuery.
  const focusScope = useFocusTraceScope(focus, showExample);
  // While a cross-span focus is resolving its trace.ids, gate the list query:
  // firing it before resolution would scope to a stale/empty id set.
  const focusGated = focusScope.active && focusScope.isResolving;

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
    agents: filter.agents,
    onlyErrors: filter.onlyErrors,
    onlyPii: filter.onlyPii,
    onlyWarnings: filter.onlyWarnings,
    onlyTruncated: filter.onlyTruncated,
    latency: filter.latency,
    temperature: filter.temperature,
  };
  // A heavy-numeric user sort is lifted into the DQL ORDER BY (before the cap);
  // sample-only sorts resolve to null and leave the query byte-identical, so
  // toggling them triggers no refetch.
  const serverSort = serverSortClause(sort);
  const query = useMemo(
    () => {
      if (!canQuery) return "";
      const base = buildPromptsListQuery(
        resolution.serviceIds,
        scope.timeframe,
        filters,
        sidebar,
        focus,
        serverSort,
      );
      // For a cross-span focus, scope the list to the resolved trace.ids. An
      // empty array injects the no-match sentinel so the list renders empty
      // (the correct result when the pattern matched no traces). Inactive ⇒
      // base query unchanged.
      const scoped = focusScope.active
        ? injectTraceScope(base, focusScope.traceIds)
        : base;
      return scoped + ` /* r${refreshKey} */`;
    },
    [
      canQuery,
      resolution.serviceIds,
      scope.timeframe,
      refreshKey,
      focus,
      serverSort,
      focusScope.active,
      focusScope.traceIds,
      filter.services?.join(","),
      filter.kinds?.join(","),
      filter.search,
      filter.providers?.join(","),
      filter.operations?.join(","),
      filter.agents?.join(","),
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
    // Don't fire the list until a cross-span focus has resolved its trace.ids
    // (firing early would scope to a stale/empty set). The global attribute
    // filter still applies and ANDs with the focus scope — both inject a
    // `| filter in(trace.id, …)` and a span must satisfy every one.
    enabled: canQuery && !focusGated && !showExample,
    staleTime: 60_000,
  });

  // Trace → agent map: LLM-call spans carry no agent name, so resolve the
  // owning agent per trace.id and backfill it. Opts out of global filtering so
  // an agent filter doesn't drop the LLM spans we're trying to attribute.
  const { data: agentMapData } = useScopedDql<{ trace_id?: string; agent?: string }>(
    canQuery ? buildPromptAgentMapQuery(resolution.serviceIds, scope.timeframe) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000, ignoreGlobalFilter: true },
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
    { enabled: canQuery && !showExample, staleTime: 300_000, ignoreGlobalFilter: true },
  );

  return useMemo<UsePromptsResult>(() => {
    const traceAgent = new Map<string, string>();
    for (const m of agentMapData?.records ?? []) {
      if (typeof m.trace_id === "string" && typeof m.agent === "string") {
        traceAgent.set(m.trace_id, m.agent);
      }
    }

    // Demo Mode: render the bundled fixture set (already parsed through the
    // same parsePromptRecords this real path uses — see demoData.ts) instead
    // of the query results. Every downstream computation (facets, hasContent/
    // hasEval, client-side filtering) below is unchanged — it just operates on
    // `prompts` regardless of where the rows came from.
    const prompts: PromptRow[] = showExample
      ? DEMO_PROMPT_ROWS
      : parsePromptRecords(data?.records ?? [], traceAgent);

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

    const filtered = prompts.filter((p) => {
      if (kinds.length > 0 && !kinds.includes(p.kind)) return false;
      if (services.length > 0 && !services.includes(p.service)) return false;
      if (models.length > 0 && (!p.model || !models.includes(p.model))) return false;
      // Agent is filtered SERVER-SIDE (trace join in buildPromptsListQuery) so
      // it works against the full population, not just the 200-row sample.
      // Cost filters are in dollars; PromptRow stores cents.
      if (!matchRange(p.inCost / 100, filter.inCost)) return false;
      if (!matchRange(p.outCost / 100, filter.outCost)) return false;
      // Eval-score drill-down from a quality tile (Prompts-4): keep only spans
      // failing the clicked metric; unscored spans drop out.
      if (filter.eval && !matchEvalFilter(p, filter.eval)) return false;
      if (search) {
        const hay =
          `${p.promptText} ${p.responseText} ${p.service} ${p.model ?? ""} ${p.agent ?? ""}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      // Demo Mode has no real query to apply the server-side sidebar clauses
      // (providers/operations/status toggles/agent/latency/temperature) —
      // replicate them client-side over the fixed demo rows so every sidebar
      // control stays functional while showing example data. In real mode
      // these are already applied server-side (see buildPromptsListQuery),
      // so re-checking them here would be redundant, not wrong — but is
      // skipped to keep real-mode behavior byte-for-byte unchanged.
      if (showExample) {
        if (filter.onlyErrors && !p.hasError) return false;
        if (filter.onlyPii && !p.piiDetected) return false;
        if (filter.onlyWarnings && !p.hasWarning) return false;
        if (filter.onlyTruncated && !p.truncated) return false;
        if (
          filter.providers?.length &&
          (!p.provider || !filter.providers.includes(p.provider))
        )
          return false;
        if (
          filter.operations?.length &&
          !filter.operations.includes(p.typeLabel)
        )
          return false;
        if (filter.agents?.length && (!p.agent || !filter.agents.includes(p.agent)))
          return false;
        if (!matchRange(p.durationMs, filter.latency)) return false;
        if (
          filter.temperature &&
          (p.temperature == null || !matchRange(p.temperature, filter.temperature))
        )
          return false;
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
      // Surface the cross-span focus resolution as loading too, so the table
      // shows its spinner (not an empty state) while the trace.ids resolve.
      // Demo Mode data is bundled and synchronous, so it's never "loading".
      isLoading: showExample ? false : resolution.isLoading || isLoading || focusGated,
      error: showExample ? undefined : (error ?? undefined) ?? focusScope.error,
      refetch,
    };
  }, [
    data,
    agentMapData,
    facetData,
    isLoading,
    error,
    resolution.isLoading,
    focusGated,
    focusScope.error,
    showExample,
    filter?.search,
    filter?.kinds?.join(","),
    filter?.services?.join(","),
    filter?.models?.join(","),
    filter?.agents?.join(","),
    filter?.providers?.join(","),
    filter?.operations?.join(","),
    filter?.onlyErrors,
    filter?.onlyPii,
    filter?.onlyWarnings,
    filter?.onlyTruncated,
    filter?.latency?.op,
    filter?.latency?.min,
    filter?.latency?.max,
    filter?.temperature?.op,
    filter?.temperature?.min,
    filter?.temperature?.max,
    filter?.inCost?.op,
    filter?.inCost?.min,
    filter?.inCost?.max,
    filter?.outCost?.op,
    filter?.outCost?.min,
    filter?.outCost?.max,
    filter?.eval?.metric,
    filter?.eval?.op,
    filter?.eval?.threshold,
    refetch,
  ]);
};
