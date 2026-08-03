import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { SAFE_TRACE_CAP } from "../../scope/queries";
import { crossSpanFocusPreset } from "./focus";

/**
 * Resolves the `trace.id`s for a CROSS-SPAN Prompts focus (PP-4).
 *
 * The same-span LLM focuses (PP-3) inject a `| filter` predicate straight into
 * the Prompts list query. The cross-span patterns (tool-retry-storm,
 * agent-n1-tool-calls, vdb-topk-over-retrieval, mem-history-growth) can't —
 * their defining signal lives on the tool / state span, not the LLM/prompt span
 * the Prompts page reads. So this hook runs the focus's per-pattern
 * trace-resolution query and returns the matching trace.ids; `usePrompts` then
 * scopes the Prompts list to those traces via `injectTraceScope` (the same
 * machinery the hybrid global filter uses for cross-span entity filters).
 *
 * The resolver runs ONLY when the active focus is one of the cross-span ids
 * (`active`). For a same-span / unknown / absent focus the query is empty, the
 * hook is inert (`active: false`, `traceIds: null`), and the Prompts list runs
 * its synchronous predicate path unchanged.
 *
 * `injectTraceScope` semantics: `traceIds === null` ⇒ no scope (query
 * unchanged); an empty array ⇒ scope matched nothing (pages render empty via
 * the no-match sentinel). We return `null` while inactive, and the resolved
 * array (possibly empty) once active + loaded — so callers gate the list with
 * `isResolving` and feed `traceIds` to `injectTraceScope` only when active.
 *
 * Uses `useScopedDql` with `ignoreGlobalFilter: true` so the global attribute
 * filter / trace-scope isn't re-injected into the resolver itself (the resolver
 * defines its own population). The resolved scope is capped at SAFE_TRACE_CAP;
 * cap+1 is requested so truncation is detectable.
 */
export interface FocusTraceScope {
  /** True when the active focus is a cross-span (trace-scoped) preset. */
  active: boolean;
  /** Resolved trace.ids (capped), or `null` when inactive. Empty array = the
   *  pattern matched no traces (the Prompts list should render empty). */
  traceIds: string[] | null;
  /** True while the resolver query is in flight (gate the Prompts list). */
  isResolving: boolean;
  /** True when the matching trace set exceeded SAFE_TRACE_CAP and was cut. */
  isTruncated: boolean;
  /** Number of trace.ids resolved (after the cap). */
  matchedCount: number;
  error?: Error;
}

interface TraceRow {
  trace_id?: string | null;
}

export const useFocusTraceScope = (
  focus: string | null | undefined,
  /**
   * True to skip real resolution entirely (Demo Mode / no-telemetry
   * fallback). The Prompts list already renders its bundled demo rows
   * unfiltered by any cross-span trace scope in that case, so this simply
   * reports inert rather than firing a real resolver query.
   */
  showExample = false,
): FocusTraceScope => {
  const { scope } = useScope();
  const preset = crossSpanFocusPreset(focus);
  const active = Boolean(preset) && !showExample;
  const cap = SAFE_TRACE_CAP;

  const query = useMemo(
    () => (preset ? preset.buildResolveQuery(scope.timeframe, cap) : ""),
    [preset, scope.timeframe, cap],
  );

  const { data, isLoading, error } = useScopedDql<TraceRow>(query, {
    enabled: active,
    staleTime: 30_000,
    // The resolver defines its OWN span population (the pattern's defining
    // signal). Re-injecting the global attribute filter / trace-scope here
    // would distort that population, so opt out — exactly like TraceScopeContext.
    ignoreGlobalFilter: true,
  });

  return useMemo<FocusTraceScope>(() => {
    if (!active) {
      return {
        active: false,
        traceIds: null,
        isResolving: false,
        isTruncated: false,
        matchedCount: 0,
      };
    }
    const all = (data?.records ?? [])
      .map((r) => (r?.trace_id != null ? String(r.trace_id) : null))
      .filter((v): v is string => v !== null);
    const isTruncated = all.length > cap;
    const traceIds = isTruncated ? all.slice(0, cap) : all;
    return {
      active: true,
      traceIds,
      isResolving: isLoading,
      isTruncated,
      matchedCount: traceIds.length,
      error: (error as Error | undefined) ?? undefined,
    };
  }, [active, data, isLoading, error, cap]);
};
