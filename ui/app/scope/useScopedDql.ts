import { useMemo } from "react";
import {
  useDql,
  type UseDqlOptions,
  type UseDqlResult,
} from "@dynatrace-sdk/react-hooks";
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
 * Drop-in replacement for `useDql` that injects the global scan-limit and
 * sampling-ratio settings. Same signature, same return shape.
 */
export function useScopedDql<T = ResultRecord>(
  query: string,
  options?: UseDqlOptions<T>,
): UseDqlResult<T> {
  const { scanLimitGb } = useScanLimit();
  const { samplingRatio } = useSampling();
  const rewritten = useMemo(
    () => applySampling(applyScanLimit(query, scanLimitGb), samplingRatio),
    [query, scanLimitGb, samplingRatio],
  );
  return useDql<T>(rewritten, options);
}
