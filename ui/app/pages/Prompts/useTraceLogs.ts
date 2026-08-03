import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { buildTraceLogsQuery } from "./queries";
import { RAW_DEMO_TRACE_LOG_RECORDS_BY_TRACE_ID } from "./demoData";
import { parseTraceLogRecords } from "./promptsParse";

export interface TraceLogLine {
  timestampMs: number;
  status: string;
  level: string;
  content: string;
  spanId: string | null;
  source: string;
  namespace: string | null;
}

export interface TraceLogRecord {
  timestamp?: string | number;
  status?: string;
  loglevel?: string;
  content?: string;
  span_id?: string | null;
  source?: string;
  namespace?: string | null;
}

export interface UseTraceLogsResult {
  logs: TraceLogLine[];
  isLoading: boolean;
  error?: Error;
}

// `parseTraceLogRecords` (raw DQL row → TraceLogLine[]) lives in
// `./promptsParse` — a dependency-free pure module — so both this hook and
// the Demo Mode dataset can share it without either importing the other's
// Context-dependent runtime code. Re-exported for anything that still
// imports it from this hook file.
export { parseTraceLogRecords };

/** Precomputed once at module load, per demo trace id, via the SAME
 *  `parseTraceLogRecords` the real query path uses above. */
const DEMO_TRACE_LOGS_BY_TRACE_ID: Record<string, TraceLogLine[]> = Object.fromEntries(
  Object.entries(RAW_DEMO_TRACE_LOG_RECORDS_BY_TRACE_ID).map(([traceId, records]) => [
    traceId,
    parseTraceLogRecords(records),
  ]),
);

/**
 * Logs correlated to a trace (by trace_id), for the detail panel's Logs tab.
 * Opts out of the global attribute filter — a trace's logs should always
 * resolve regardless of the toolbar's span-level filter.
 */
export const useTraceLogs = (
  traceId: string | null,
  startMs?: number,
  /** True to render the bundled Demo Mode log fixture instead of querying Grail. */
  showExample = false,
): UseTraceLogsResult => {
  const { data, isLoading, error } = useScopedDql<TraceLogRecord>(
    traceId ? buildTraceLogsQuery(traceId, startMs) : "",
    { enabled: !!traceId && !showExample, staleTime: 30_000, ignoreGlobalFilter: true },
  );

  return useMemo<UseTraceLogsResult>(() => {
    if (!traceId) return { logs: [], isLoading: false };
    if (showExample) {
      return { logs: DEMO_TRACE_LOGS_BY_TRACE_ID[traceId] ?? [], isLoading: false };
    }
    const logs = parseTraceLogRecords(data?.records ?? []);
    return { logs, isLoading, error: error ?? undefined };
  }, [data, isLoading, error, traceId, showExample]);
};
