import React, { createContext, useContext, useMemo } from "react";
import { useDql, type DqlQueryParams } from "@dynatrace-sdk/react-hooks";
import { useSegments } from "@dynatrace/strato-components/filters";
import { useScope } from "./ScopeContext";
import { useGlobalFilters } from "./GlobalFilterContext";
import { useScanLimit } from "./ScanLimitContext";
import {
  buildTraceScopeQuery,
  partitionConditions,
  SAFE_TRACE_CAP,
} from "./queries";
import { injectScanLimit } from "./dqlScanLimit";

/**
 * Resolved trace scope for the CROSS-SPAN (entity) subset of the global filter.
 *
 * In the hybrid filter design (see queries.ts), only the conditions on
 * TRACE_SCOPED_ATTRS (agent name, tool name) are resolved to trace.ids — the
 * rest are injected directly per span. This provider runs ONE resolver query
 * for that scope subset and exposes the matching trace.ids; `useScopedDql`
 * injects them via `injectTraceScope`. Doing it once here (vs. per query) keeps
 * it to a single round-trip and a stable result across pages.
 *
 * When there are NO scope conditions (the common case — e.g. a model/service
 * filter, or no filter at all), the resolver does NOT run: `traceIds` is null,
 * `hasScopeConditions` is false, and page queries stay fully synchronous and
 * uncapped (no loading regression).
 *
 * The resolver uses `useDql` directly (NOT `useScopedDql`) to avoid a cycle —
 * `useScopedDql` reads this context, so the resolver must not re-inject itself.
 * The resolver query is therefore never globally filtered.
 */
export interface TraceScopeValue {
  /**
   * Trace ids every page query should be scoped to, or `null` when no SCOPE
   * condition is active (queries run unscoped). An empty array means the scope
   * resolved to zero traces — pages then render empty (the correct result).
   */
  traceIds: string[] | null;
  /** True when at least one TRACE_SCOPED_ATTRS condition is active. */
  hasScopeConditions: boolean;
  /** True while the resolver query is in flight (gate scoped page queries). */
  isResolving: boolean;
  /** True when the matching trace set exceeded SAFE_TRACE_CAP and was cut. */
  isTruncated: boolean;
  /** Number of trace ids actually injected (after the cap). */
  matchedCount: number;
  /** The active cap (SAFE_TRACE_CAP). */
  cap: number;
  error?: Error;
}

const TraceScopeContext = createContext<TraceScopeValue | null>(null);

interface TraceRow {
  trace_id?: string | null;
}

export const TraceScopeProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { scope } = useScope();
  const { filters } = useGlobalFilters();
  const { scanLimitGb } = useScanLimit();
  const { segments } = useSegments();

  // Only the SCOPE subset (agent/tool) is resolved to trace.ids; the direct
  // subset (model/service/…) is injected per span by useScopedDql.
  const scopeConditions = useMemo(
    () => partitionConditions(filters.conditions).scope,
    [filters.conditions],
  );
  const hasScopeConditions = scopeConditions.length > 0;
  const cap = SAFE_TRACE_CAP;

  const queryInput = useMemo<string | DqlQueryParams>(() => {
    if (!hasScopeConditions) return "";
    // Full fidelity (samplingRatio: 1, from the builder) so the resolver never
    // misses a matching trace. Respects the same scan-limit + segments as every
    // other query. It is NOT globally filtered (uses raw useDql) to avoid a
    // recursive self-injection.
    const q = injectScanLimit(
      buildTraceScopeQuery(scope.timeframe, { conditions: scopeConditions }, cap),
      scanLimitGb,
    );
    if (segments && segments.length > 0) {
      return { query: q, filterSegments: segments };
    }
    return q;
  }, [hasScopeConditions, scope.timeframe, scopeConditions, cap, scanLimitGb, segments]);

  const result = useDql<TraceRow>(queryInput, {
    enabled: hasScopeConditions,
    staleTime: 30_000,
  });

  const value = useMemo<TraceScopeValue>(() => {
    if (!hasScopeConditions) {
      return {
        traceIds: null,
        hasScopeConditions: false,
        isResolving: false,
        isTruncated: false,
        matchedCount: 0,
        cap,
      };
    }
    const rows = result.data?.records ?? [];
    const all = rows
      .map((r) => (r?.trace_id != null ? String(r.trace_id) : null))
      .filter((v): v is string => v !== null);
    const isTruncated = all.length > cap;
    const traceIds = isTruncated ? all.slice(0, cap) : all;
    return {
      traceIds,
      hasScopeConditions: true,
      isResolving: result.isLoading,
      isTruncated,
      matchedCount: traceIds.length,
      cap,
      error: result.error as Error | undefined,
    };
  }, [hasScopeConditions, result.data, result.isLoading, result.error, cap]);

  return (
    <TraceScopeContext.Provider value={value}>
      {children}
    </TraceScopeContext.Provider>
  );
};

export const useTraceScope = (): TraceScopeValue => {
  const ctx = useContext(TraceScopeContext);
  if (!ctx) {
    throw new Error("useTraceScope must be used within a TraceScopeProvider");
  }
  return ctx;
};
