import { useMemo } from "react";
import {
  useDql,
  type UseDqlOptions,
  type UseDqlResult,
} from "@dynatrace-sdk/react-hooks";
import type { ResultRecord } from "@dynatrace-sdk/client-query";
import { useScanLimit } from "./ScanLimitContext";

const SCAN_LIMIT_RE = /scanLimitGBytes:\s*\d+/g;

/**
 * Rewrites every `scanLimitGBytes: N` occurrence in a query string to the
 * user-selected ceiling from ScanLimitContext. The default in each query
 * builder becomes a placeholder — the user's pick wins.
 */
const applyScanLimit = (query: string, scanLimitGb: number): string => {
  if (!query) return query;
  return query.replace(SCAN_LIMIT_RE, `scanLimitGBytes: ${scanLimitGb}`);
};

/**
 * Drop-in replacement for `useDql` that injects the global scan-limit
 * setting. Same signature, same return shape — just substitute the import.
 */
export function useScopedDql<T = ResultRecord>(
  query: string,
  options?: UseDqlOptions<T>,
): UseDqlResult<T> {
  const { scanLimitGb } = useScanLimit();
  const rewritten = useMemo(
    () => applyScanLimit(query, scanLimitGb),
    [query, scanLimitGb],
  );
  return useDql<T>(rewritten, options);
}
