import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { buildTraceSpansQuery, TRACE_SPANS_LIMIT } from "./queries";
import { toNum } from "../../data/format";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

const bool = (v: unknown): boolean => v === true || v === "true";

const str = (v: unknown): string => (typeof v === "string" ? v : "");

const strOrNull = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

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
  mcpMethod: string | null;
  statusMessage: string | null;
  httpStatus: number | null;
  lgNode: string | null;
  lgCheckpoint: string | null;
  /**
   * Every raw span attribute (key/value), with the derived query-helper fields
   * removed. Powers the namespace-grouped attribute panel. Keys are the raw
   * dotted attribute names (e.g. `gen_ai.prompt.0.role`, `traceloop.span.kind`).
   */
  attributes: Record<string, unknown>;
}

/** Derived helper columns added by buildTraceSpansQuery (not real span
 *  attributes) — stripped from the attribute map so the panel only shows true
 *  span data. */
const DERIVED_KEYS = new Set([
  "dur_ms",
  "cpu_ms",
  "cpu_self_ms",
  "in_tok",
  "out_tok",
  "has_error",
  "svc",
]);

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
  /** True when the fetch hit the span ceiling — the (full) trace has more spans
   *  than TRACE_SPANS_LIMIT, so the waterfall shows only the first slice. */
  isTruncated: boolean;
}

export const useTraceSpans = (
  traceId: string | null,
  startMs?: number,
): UseTraceSpansResult => {
  // ignoreGlobalFilter: a single-trace lookup must always resolve every span
  // in the trace. Injecting the toolbar's attribute filter (e.g. an agent
  // name) would drop most spans and break the waterfall.
  const { data, isLoading, error } = useScopedDql<Record<string, unknown>>(
    traceId ? buildTraceSpansQuery(traceId, startMs) : "",
    { enabled: !!traceId, staleTime: 30_000, ignoreGlobalFilter: true },
  );

  return useMemo<UseTraceSpansResult>(() => {
    if (!traceId) {
      return { spans: [], isLoading: false, isTruncated: false };
    }

    const spans: TraceSpan[] = [];
    for (const r of data?.records ?? []) {
      const nOrNull = (v: unknown): number | null =>
        v == null ? null : num(v);
      // Raw span attributes minus the derived query helpers, for the panel.
      const attributes: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (!DERIVED_KEYS.has(k)) attributes[k] = v;
      }
      spans.push({
        spanId: str(r["span.id"]),
        parentSpanId: strOrNull(r["span.parent_id"]),
        name: str(r["span.name"]),
        service: str(r.svc) || str(r["service.name"]) || str(r["dt.service.name"]),
        durationMs: num(r.dur_ms),
        timestampMs: parseTimestamp(r.start_time),
        endTimeMs: r.end_time == null ? null : parseTimestamp(r.end_time),
        isError: bool(r.has_error),
        spanKind: strOrNull(r["span.kind"]),
        statusCode: strOrNull(r["span.status_code"]),
        isRoot:
          r["request.is_root_span"] == null
            ? null
            : bool(r["request.is_root_span"]),
        endpoint: strOrNull(r["endpoint.name"]),
        codeFunction: strOrNull(r["code.function"]),
        codeNamespace: strOrNull(r["code.namespace"]),
        cpuMs: r.cpu_ms == null ? null : nOrNull(r.cpu_ms),
        cpuSelfMs: r.cpu_self_ms == null ? null : nOrNull(r.cpu_self_ms),
        provider:
          strOrNull(r["gen_ai.system"]) ?? strOrNull(r["gen_ai.provider.name"]),
        model:
          strOrNull(r["gen_ai.request.model"]) ??
          strOrNull(r["gen_ai.response.model"]) ??
          strOrNull(r["gen_ai.model"]),
        operation: strOrNull(r["gen_ai.operation.name"]),
        agentName: strOrNull(r["gen_ai.agent.name"]),
        toolName: strOrNull(r["gen_ai.tool.name"]),
        inTokens: num(r.in_tok),
        outTokens: num(r.out_tok),
        exceptionType: strOrNull(r["exception.type"]),
        exceptionMsg: strOrNull(r["exception.message"]),
        workflow: strOrNull(r["traceloop.workflow.name"]),
        tlEntity: strOrNull(r["traceloop.entity.name"]),
        tlEntityPath: strOrNull(r["traceloop.entity.path"]),
        tlKind: strOrNull(r["traceloop.span.kind"]),
        sessionId: strOrNull(r["dt.rum.session.id"]),
        mcpMethod: strOrNull(r["mcp.method.name"]),
        statusMessage: strOrNull(r["span.status_message"]),
        httpStatus: nOrNull(r["http.response.status_code"]),
        lgNode: strOrNull(r["traceloop.association.properties.langgraph_node"]),
        lgCheckpoint: strOrNull(
          r["traceloop.association.properties.langgraph_checkpoint_ns"],
        ),
        attributes,
      });
    }

    return {
      spans,
      isLoading,
      error: error ?? undefined,
      isTruncated: spans.length >= TRACE_SPANS_LIMIT,
    };
  }, [data, isLoading, error, traceId]);
};
