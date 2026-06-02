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
  endTimeMs: number | null;
  isError: boolean;
  spanKind: string | null;
  statusCode: string | null;
  isRoot: boolean | null;
  endpoint: string | null;
  codeFunction: string | null;
  codeNamespace: string | null;
  cpuMs: number | null;
  cpuSelfMs: number | null;
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
  tlEntity: string | null;
  tlEntityPath: string | null;
  tlKind: string | null;
  sessionId: string | null;
}

interface TraceSpanRecord {
  span_id?: string;
  parent_span_id?: string | null;
  name?: string;
  service?: string;
  duration_ms?: number;
  timestamp?: string | number;
  end_time?: string | number | null;
  has_error?: boolean | string;
  span_kind?: string | null;
  status_code?: string | null;
  is_root?: boolean | string | null;
  endpoint?: string | null;
  code_function?: string | null;
  code_namespace?: string | null;
  cpu_ms?: number | null;
  cpu_self_ms?: number | null;
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
  tl_entity?: string | null;
  tl_entity_path?: string | null;
  tl_kind?: string | null;
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
  startMs?: number,
): UseTraceSpansResult => {
  // ignoreGlobalFilter: a single-trace lookup must always resolve every span
  // in the trace. Injecting the toolbar's attribute filter (e.g. an agent
  // name) would drop most spans and break the waterfall.
  const { data, isLoading, error } = useScopedDql<TraceSpanRecord>(
    traceId ? buildTraceSpansQuery(traceId, startMs) : "",
    { enabled: !!traceId, staleTime: 30_000, ignoreGlobalFilter: true },
  );

  return useMemo<UseTraceSpansResult>(() => {
    if (!traceId) {
      return { spans: [], isLoading: false };
    }

    const spans: TraceSpan[] = [];
    for (const r of data?.records ?? []) {
      const nOrNull = (v: unknown): number | null =>
        v == null ? null : num(v);
      spans.push({
        spanId: str(r.span_id),
        parentSpanId: r.parent_span_id ?? null,
        name: str(r.name),
        service: str(r.service),
        durationMs: num(r.duration_ms),
        timestampMs: parseTimestamp(r.timestamp),
        endTimeMs: r.end_time == null ? null : parseTimestamp(r.end_time),
        isError: bool(r.has_error),
        spanKind: r.span_kind ?? null,
        statusCode: r.status_code ?? null,
        isRoot:
          r.is_root == null ? null : r.is_root === true || r.is_root === "true",
        endpoint: r.endpoint ?? null,
        codeFunction: r.code_function ?? null,
        codeNamespace: r.code_namespace ?? null,
        cpuMs: nOrNull(r.cpu_ms),
        cpuSelfMs: nOrNull(r.cpu_self_ms),
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
        tlEntity: r.tl_entity ?? null,
        tlEntityPath: r.tl_entity_path ?? null,
        tlKind: r.tl_kind ?? null,
        sessionId: r.session_id ?? null,
      });
    }

    return { spans, isLoading, error: error ?? undefined };
  }, [data, isLoading, error, traceId]);
};
