import { useMemo } from "react";
import {
  useDql,
  type DqlQueryParams,
  type UseDqlOptions,
  type UseDqlResult,
} from "@dynatrace-sdk/react-hooks";
import { useSegments } from "@dynatrace/strato-components/filters";
import type { ResultRecord } from "@dynatrace-sdk/client-query";
import { useScanLimit } from "./ScanLimitContext";
import { useSampling } from "./SamplingContext";
import { useGlobalFilters } from "./GlobalFilterContext";
import { useTraceScope } from "./TraceScopeContext";
import {
  injectGlobalFilters,
  injectTraceScope,
  partitionConditions,
} from "./queries";
import { injectScanLimit } from "./dqlScanLimit";

const SAMPLING_RE = /samplingRatio:\s*\d+/g;
// Matches `fetch spans` / `fetch logs` followed by a comma, ONLY when the
// statement (up to the next `|` pipe) does not already declare a samplingRatio.
// Used to retro-inject samplingRatio into queries that forgot to include one.
const FETCH_NEEDS_SAMPLING_RE =
  /\bfetch\s+(spans|logs)\s*,(?![^|]*\bsamplingRatio\b)/g;

const applySampling = (query: string, samplingRatio: number): string => {
  if (!query) return query;
  // First inject `samplingRatio: 1` only where missing, then rewrite every
  // occurrence to the user-selected value. Two passes keep injection
  // idempotent against queries that already declare a sampling ratio.
  const injected = query.replace(
    FETCH_NEEDS_SAMPLING_RE,
    `fetch $1, samplingRatio: 1,`,
  );
  return injected.replace(SAMPLING_RE, `samplingRatio: ${samplingRatio}`);
};

/**
 * Extra options layered onto useDql's own options. The scan limit is ALWAYS the
 * toolbar selector (injected into every query) — there is no per-query opt-out,
 * so no query can hardcode or escape the user's scan-limit choice.
 */
export interface UseScopedDqlExtra {
  /**
   * Opt this query out of the global attribute filter injection. Use for
   * queries that must see unfiltered data (e.g. filter value discovery) or
   * where a span-level filter would break the query semantics (e.g. the agent
   * trace-join, whose first stage must keep both agent and LLM spans).
   */
  ignoreGlobalFilter?: boolean;
  /**
   * Force this query's sampling ratio instead of the toolbar selection. Used by
   * heavy multi-window background estimates (e.g. the 8-day spend glance) that
   * scan multiple TB per window and cannot complete within the platform's query
   * execution-time limit at full fidelity on high-volume tenants. The caller is
   * responsible for extrapolating its sum/count aggregates by the same ratio.
   * Sum-aggregate estimates extrapolate cleanly; never use this for queries the
   * user expects at the exact fidelity they selected.
   */
  samplingRatioOverride?: number;
}

/**
 * Drop-in replacement for `useDql` that injects:
 *   - the global scan-limit (injected into every fetch; no query hardcodes it)
 *   - the global sampling ratio (rewrites `samplingRatio: N` in the query)
 *   - the active filter segments (passed as a request parameter, not in DQL)
 *
 * Same signature and return shape as `useDql`. Segments are only attached
 * when at least one is selected — otherwise the underlying call uses the
 * plain string form so query keys stay stable.
 */
export function useScopedDql<T = ResultRecord>(
  query: string,
  options?: UseDqlOptions<T> & UseScopedDqlExtra,
): UseDqlResult<T> {
  const { scanLimitGb } = useScanLimit();
  const { samplingRatio } = useSampling();
  const { segments } = useSegments();
  const { filters } = useGlobalFilters();
  const { traceIds, hasScopeConditions, isResolving } = useTraceScope();
  const ignoreGlobalFilter = Boolean(options?.ignoreGlobalFilter);
  // A per-query override wins over the toolbar ratio (used by heavy background
  // estimates that can't run at full fidelity — see UseScopedDqlExtra).
  const effectiveSampling = options?.samplingRatioOverride ?? samplingRatio;

  // Split the active conditions: the DIRECT subset (model/service/…) is injected
  // per span; the SCOPE subset (agent/tool) is resolved to trace.ids by
  // TraceScopeContext and injected as `in(trace.id, …)`.
  const directConditions = useMemo(
    () => partitionConditions(filters.conditions).direct,
    [filters.conditions],
  );

  const queryInput = useMemo<string | DqlQueryParams>(() => {
    // Sampling first (may inject samplingRatio, adding the comma the scan-limit
    // injector keys on), then the scan limit, then the hybrid global filter.
    const sampled = applySampling(query, effectiveSampling);
    const scanned = injectScanLimit(sampled, scanLimitGb);
    // HYBRID injection (unless the caller opted out):
    //  - DIRECT subset → `| filter in(toString(attr), array(...))` on the
    //    page's own spans. Uncapped and exact, no trace-id materialisation, so
    //    no DQL expression-limit crash on busy attributes (model, service, …).
    //  - SCOPE subset → `| filter in(trace.id, array(toUid(...)))` from the
    //    resolved trace.ids, so a cross-span entity filter (agent/tool) reaches
    //    pages built on OTHER span types (e.g. agent → Prompts LLM spans).
    // Both AND together when both subsets are active.
    let rewritten = scanned;
    if (!ignoreGlobalFilter) {
      rewritten = injectGlobalFilters(rewritten, { conditions: directConditions });
      if (hasScopeConditions) {
        rewritten = injectTraceScope(rewritten, traceIds);
      }
    }
    if (!rewritten) return rewritten;
    if (!segments || segments.length === 0) return rewritten;
    return {
      query: rewritten,
      // Strato's useSegments returns QueryFilterSegment[] which is exactly
      // what ExecuteRequest.filterSegments expects.
      filterSegments: segments,
    };
  }, [
    query,
    scanLimitGb,
    effectiveSampling,
    segments,
    ignoreGlobalFilter,
    directConditions,
    hasScopeConditions,
    traceIds,
  ]);

  // The direct subset is synchronous (no resolver), so the common no-scope case
  // is never gated. Only gate while a SCOPE condition is actively resolving its
  // trace.ids — firing the page query before resolution would scope to the
  // wrong (stale/empty) id set. `ignoreGlobalFilter` queries are never gated.
  const callerEnabled = options?.enabled ?? true;
  const enabled =
    callerEnabled &&
    !(!ignoreGlobalFilter && hasScopeConditions && isResolving);

  // `ignoreGlobalFilter` is an extra key useDql ignores; forward options as-is.
  return useDql<T>(queryInput, { ...options, enabled });
}
