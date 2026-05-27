import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { buildTraceSpansQuery } from "./queries";
import { toNum } from "../../data/format";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

const bool = (v: unknown): boolean => v === true || v === "true";

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export interface TraceSpan {
  spanId: string;
  parentSpanId: string | null;
  name: string;
  service: string;
  durationMs: number;
  timestampMs: number;
  isError: boolean;
  provider: string | null;
  model: string | null;
  operation: string | null;
  agentName: string | null;
  toolName: string | null;
  inTokens: number;
  outTokens: number;
  exceptionType: string | null;
  exceptionMsg: string | null;
  workflow: string | null;
  sessionId: string | null;
}

interface TraceSpanRecord {
  span_id?: string;
  parent_span_id?: string | null;
  name?: string;
  service?: string;
  duration_ms?: number;
  timestamp?: string | number;
  has_error?: boolean | string;
  gen_ai_provider?: string | null;
  gen_ai_model?: string | null;
  gen_ai_operation?: string | null;
  agent_name?: string | null;
  tool_name?: string | null;
  in_tok?: number;
  out_tok?: number;
  exception_type?: string | null;
  exception_msg?: string | null;
  workflow?: string | null;
  session_id?: string | null;
}

const parseTimestamp = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const parsed = Date.parse(v);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
};

export interface UseTraceSpansResult {
  spans: TraceSpan[];
  isLoading: boolean;
  error?: Error;
}

export const useTraceSpans = (
  traceId: string | null,
): UseTraceSpansResult => {
  const { data, isLoading, error } = useScopedDql<TraceSpanRecord>(
    traceId ? buildTraceSpansQuery(traceId) : "",
    { enabled: !!traceId, staleTime: 30_000 },
  );

  return useMemo<UseTraceSpansResult>(() => {
    if (!traceId) {
      return { spans: [], isLoading: false };
    }

    const spans: TraceSpan[] = [];
    for (const r of data?.records ?? []) {
      spans.push({
        spanId: str(r.span_id),
        parentSpanId: r.parent_span_id ?? null,
        name: str(r.name),
        service: str(r.service),
        durationMs: num(r.duration_ms),
        timestampMs: parseTimestamp(r.timestamp),
        isError: bool(r.has_error),
        provider: r.gen_ai_provider ?? null,
        model: r.gen_ai_model ?? null,
        operation: r.gen_ai_operation ?? null,
        agentName: r.agent_name ?? null,
        toolName: r.tool_name ?? null,
        inTokens: num(r.in_tok),
        outTokens: num(r.out_tok),
        exceptionType: r.exception_type ?? null,
        exceptionMsg: r.exception_msg ?? null,
        workflow: r.workflow ?? null,
        sessionId: r.session_id ?? null,
      });
    }

    return { spans, isLoading, error: error ?? undefined };
  }, [data, isLoading, error, traceId]);
};
