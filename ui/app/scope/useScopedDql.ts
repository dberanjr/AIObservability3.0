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
import { injectGlobalFilters } from "./queries";
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
  const ignoreGlobalFilter = Boolean(options?.ignoreGlobalFilter);

  const queryInput = useMemo<string | DqlQueryParams>(() => {
    // Sampling first (may inject samplingRatio, adding the comma the scan-limit
    // injector keys on), then the scan limit, then the global filter.
    const sampled = applySampling(query, samplingRatio);
    const scanned = injectScanLimit(sampled, scanLimitGb);
    // Inject the global attribute filter into every fetch query (unless the
    // caller opted out) so the toolbar filter is truly app-wide.
    const rewritten = ignoreGlobalFilter
      ? scanned
      : injectGlobalFilters(scanned, filters);
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
    samplingRatio,
    segments,
    ignoreGlobalFilter,
    filters,
  ]);

  // `ignoreGlobalFilter` is an extra key useDql ignores; forward options as-is.
  return useDql<T>(queryInput, options);
}
