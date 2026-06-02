import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { buildTraceLogsQuery } from "./queries";

const str = (v: unknown): string => (typeof v === "string" ? v : "");

const parseTimestamp = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const parsed = Date.parse(v);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
};

export interface TraceLogLine {
  timestampMs: number;
  status: string;
  level: string;
  content: string;
  spanId: string | null;
  source: string;
  namespace: string | null;
}

interface TraceLogRecord {
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

/**
 * Logs correlated to a trace (by trace_id), for the detail panel's Logs tab.
 * Opts out of the global attribute filter — a trace's logs should always
 * resolve regardless of the toolbar's span-level filter.
 */
export const useTraceLogs = (
  traceId: string | null,
  startMs?: number,
): UseTraceLogsResult => {
  const { data, isLoading, error } = useScopedDql<TraceLogRecord>(
    traceId ? buildTraceLogsQuery(traceId, startMs) : "",
    { enabled: !!traceId, staleTime: 30_000, ignoreGlobalFilter: true },
  );

  return useMemo<UseTraceLogsResult>(() => {
    if (!traceId) return { logs: [], isLoading: false };
    const logs: TraceLogLine[] = [];
    for (const r of data?.records ?? []) {
      logs.push({
        timestampMs: parseTimestamp(r.timestamp),
        status: str(r.status) || str(r.loglevel) || "INFO",
        level: str(r.loglevel),
        content: str(r.content),
        spanId: r.span_id ?? null,
        source: str(r.source),
        namespace: r.namespace ?? null,
      });
    }
    return { logs, isLoading, error: error ?? undefined };
  }, [data, isLoading, error, traceId]);
};
