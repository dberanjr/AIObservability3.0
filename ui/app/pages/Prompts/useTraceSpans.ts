import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { buildTraceSpansQuery, TRACE_SPANS_LIMIT } from "./queries";
import { RAW_DEMO_TRACE_SPAN_RECORDS_BY_TRACE_ID } from "./demoData";
import { parseTraceSpanRecords } from "./promptsParse";

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

export interface UseTraceSpansResult {
  spans: TraceSpan[];
  isLoading: boolean;
  error?: Error;
  /** True when the fetch hit the span ceiling — the (full) trace has more spans
   *  than TRACE_SPANS_LIMIT, so the waterfall shows only the first slice. */
  isTruncated: boolean;
}

// `parseTraceSpanRecords` (raw DQL row → TraceSpan[]) lives in
// `./promptsParse` — a dependency-free pure module — so both this hook and
// the Demo Mode dataset can share it without either importing the other's
// Context-dependent runtime code. Re-exported for anything that still
// imports it from this hook file.
export { parseTraceSpanRecords };

/** Precomputed once at module load, per demo trace id, via the SAME
 *  `parseTraceSpanRecords` the real query path uses above. */
const DEMO_TRACE_SPANS_BY_TRACE_ID: Record<string, TraceSpan[]> = Object.fromEntries(
  Object.entries(RAW_DEMO_TRACE_SPAN_RECORDS_BY_TRACE_ID).map(([traceId, records]) => [
    traceId,
    parseTraceSpanRecords(records),
  ]),
);

export const useTraceSpans = (
  traceId: string | null,
  startMs?: number,
  /** True to render the bundled Demo Mode trace fixture instead of querying
   *  Grail (Demo Mode Tweak or the page's own no-telemetry fallback). */
  showExample = false,
): UseTraceSpansResult => {
  // ignoreGlobalFilter: a single-trace lookup must always resolve every span
  // in the trace. Injecting the toolbar's attribute filter (e.g. an agent
  // name) would drop most spans and break the waterfall.
  const { data, isLoading, error } = useScopedDql<Record<string, unknown>>(
    traceId ? buildTraceSpansQuery(traceId, startMs) : "",
    { enabled: !!traceId && !showExample, staleTime: 30_000, ignoreGlobalFilter: true },
  );

  return useMemo<UseTraceSpansResult>(() => {
    if (!traceId) {
      return { spans: [], isLoading: false, isTruncated: false };
    }
    if (showExample) {
      const spans = DEMO_TRACE_SPANS_BY_TRACE_ID[traceId] ?? [];
      return { spans, isLoading: false, isTruncated: false };
    }

    const spans = parseTraceSpanRecords(data?.records ?? []);

    return {
      spans,
      isLoading,
      error: error ?? undefined,
      isTruncated: spans.length >= TRACE_SPANS_LIMIT,
    };
  }, [data, isLoading, error, traceId, showExample]);
};
