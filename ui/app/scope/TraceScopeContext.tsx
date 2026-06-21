import React, { createContext, useContext, useMemo } from "react";
import {
  useDql,
  type DqlQueryParams,
} from "@dynatrace-sdk/react-hooks";
import { useSegments } from "@dynatrace/strato-components/filters";
import { useScope } from "./ScopeContext";
import { useGlobalFilters } from "./GlobalFilterContext";
import { useScanLimit } from "./ScanLimitContext";
import { useTweaks, TRACE_MATCH_CAPS } from "../tweaks/TweaksContext";
import { buildTraceScopeQuery, hasActiveFilter } from "./queries";
import { injectScanLimit } from "./dqlScanLimit";

/**
 * Resolved trace scope for the active global filter.
 *
 * The global filter is trace-scoped (see `buildTraceScopeQuery`): this provider
 * runs ONE resolver query that returns the set of matching trace.ids, and every
 * `useScopedDql` call injects those ids into its query. Doing it once here (vs.
 * per query) keeps it to a single round-trip and a stable result across pages.
 *
 * The resolver uses `useDql` directly (not `useScopedDql`) to avoid a cycle —
 * `useScopedDql` reads this context, so the resolver must not read its own.
 */
export interface TraceScopeValue {
  /**
   * Trace ids every query should be scoped to, or `null` when no filter is
   * active (queries run unscoped). An empty array means the filter resolved to
   * zero traces — pages then render empty, which is the correct filtered result.
   */
  traceIds: string[] | null;
  /** True when at least one filter condition is active. */
  isActive: boolean;
  /** True while the resolver query is in flight (gate page queries on this). */
  isLoading: boolean;
  /** True when the matching trace set exceeded the cap and was truncated. */
  isTruncated: boolean;
  /** Number of trace ids actually injected (after any cap). */
  matchedCount: number;
  /** The active cap (Infinity for "exact"). */
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
  const { pageConfig } = useTweaks();

  const cap = TRACE_MATCH_CAPS[pageConfig.traceMatchCap];
  const isActive = hasActiveFilter(filters);

  const queryInput = useMemo<string | DqlQueryParams>(() => {
    if (!isActive) return "";
    // The resolver runs at full fidelity (samplingRatio: 1, from the builder)
    // so it never MISSES a matching trace — pages then sample independently
    // within the resolved scope. It respects the same scan-limit + segments as
    // every other query.
    const q = injectScanLimit(
      buildTraceScopeQuery(scope.timeframe, filters, cap),
      scanLimitGb,
    );
    if (segments && segments.length > 0) {
      return { query: q, filterSegments: segments };
    }
    return q;
  }, [isActive, scope.timeframe, filters, cap, scanLimitGb, segments]);

  const result = useDql<TraceRow>(queryInput, {
    enabled: isActive,
    staleTime: 30_000,
  });

  const value = useMemo<TraceScopeValue>(() => {
    if (!isActive) {
      return {
        traceIds: null,
        isActive: false,
        isLoading: false,
        isTruncated: false,
        matchedCount: 0,
        cap,
      };
    }
    const rows = result.data?.records ?? [];
    const all = rows
      .map((r) => (r?.trace_id != null ? String(r.trace_id) : null))
      .filter((v): v is string => v !== null);
    const isTruncated = Number.isFinite(cap) && all.length > cap;
    const traceIds = isTruncated ? all.slice(0, cap) : all;
    return {
      traceIds,
      isActive: true,
      isLoading: result.isLoading,
      isTruncated,
      matchedCount: traceIds.length,
      cap,
      error: result.error as Error | undefined,
    };
  }, [isActive, result.data, result.isLoading, result.error, cap]);

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
