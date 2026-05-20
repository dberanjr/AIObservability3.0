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

const SCAN_LIMIT_RE = /scanLimitGBytes:\s*\d+/g;
const SAMPLING_RE = /samplingRatio:\s*\d+/g;
// Matches `fetch spans` / `fetch logs` followed by a comma, ONLY when the
// statement (up to the next `|` pipe) does not already declare a samplingRatio.
// Used to retro-inject samplingRatio into queries that forgot to include one.
const FETCH_NEEDS_SAMPLING_RE =
  /\bfetch\s+(spans|logs)\s*,(?![^|]*\bsamplingRatio\b)/g;

const applyScanLimit = (query: string, scanLimitGb: number): string => {
  if (!query) return query;
  return query.replace(SCAN_LIMIT_RE, `scanLimitGBytes: ${scanLimitGb}`);
};

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
 * Drop-in replacement for `useDql` that injects:
 *   - the global scan-limit (rewrites `scanLimitGBytes: N` in the query)
 *   - the global sampling ratio (rewrites `samplingRatio: N` in the query)
 *   - the active filter segments (passed as a request parameter, not in DQL)
 *
 * Same signature and return shape as `useDql`. Segments are only attached
 * when at least one is selected — otherwise the underlying call uses the
 * plain string form so query keys stay stable.
 */
export function useScopedDql<T = ResultRecord>(
  query: string,
  options?: UseDqlOptions<T>,
): UseDqlResult<T> {
  const { scanLimitGb } = useScanLimit();
  const { samplingRatio } = useSampling();
  const { segments } = useSegments();

  const queryInput = useMemo<string | DqlQueryParams>(() => {
    const rewritten = applySampling(
      applyScanLimit(query, scanLimitGb),
      samplingRatio,
    );
    if (!rewritten) return rewritten;
    if (!segments || segments.length === 0) return rewritten;
    return {
      query: rewritten,
      // Strato's useSegments returns QueryFilterSegment[] which is exactly
      // what ExecuteRequest.filterSegments expects.
      filterSegments: segments,
    };
  }, [query, scanLimitGb, samplingRatio, segments]);

  return useDql<T>(queryInput, options);
}
