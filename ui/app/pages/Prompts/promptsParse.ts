/**
 * Pure parse/fold functions for the Prompts page's data hooks — mirrors
 * `ui/app/bedrock/parse.ts`: every hook (`usePrompts`, `usePromptSummary`,
 * `usePromptQuality`, `useTraceSpans`, `useTraceLogs`, `usePromptSpanDetail`)
 * maps its raw DQL rows to its output shape by calling a function here, and
 * the Demo Mode dataset (`./demoData.ts`) runs its raw fixtures through the
 * SAME functions instead of hand-typing the parsed output.
 *
 * Deliberately dependency-free w.r.t. React / Context / Dynatrace UI packages
 * (only pure `data/`+`detection/` leaf modules) — this is what lets the demo
 * dataset's invariant tests (`demoData.test.ts`) import these functions
 * directly without dragging in `useScopedDql`'s Strato Segments dependency
 * (which touches `document` at import time and crashes under vitest's `node`
 * test environment). Every cross-import of a *type* from the actual hook
 * files below uses `import type`, which TypeScript erases entirely — so this
 * module has ZERO runtime imports from any of them, even though they all
 * import runtime values FROM here (no cycle).
 */

import { canonicalizeModel } from "../../detection/attributes";
import { costOf } from "../../data/pricing";
import { toNum } from "../../data/format";
import type { PromptRecord, PromptRow } from "./usePrompts";
import type { SummaryRecord, PromptSummary } from "./usePromptSummary";
import type { QualityRecord, PromptQuality } from "./usePromptQuality";
import type { TraceSpan } from "./useTraceSpans";
import type { TraceLogRecord, TraceLogLine } from "./useTraceLogs";
import type { SpanDetailRecord, PromptSpanDetail } from "./usePromptSpanDetail";

// ---------------------------------------------------------------------------
// Shared primitive coercions
// ---------------------------------------------------------------------------

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};
const optionalNum = (v: unknown): number | null => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : null;
};
const bool = (v: unknown): boolean => v === true || v === "true";
// Prompt/response content is usually a string, but some instrumentations emit
// gen_ai.input.messages / output.messages as a record or array — render those
// as pretty JSON so the table/popup still show something useful.
const str = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v == null) return "";
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return "[unserializable value]";
  }
};
const strShallow = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;
/** Epoch-ms, falling back to "now" — used where an unparseable timestamp
 *  shouldn't collapse a row to the start of the epoch (prompts, spans). */
const parseTimestampOrNow = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const parsed = Date.parse(v);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
};
/** Epoch-ms, falling back to 0 — matches useTraceLogs' original behavior. */
const parseTimestampOrZero = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const parsed = Date.parse(v);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
};

// ---------------------------------------------------------------------------
// usePrompts — main list
// ---------------------------------------------------------------------------

/**
 * Map raw DQL rows (buildPromptsListQuery's shape) to PromptRow, backfilling
 * the agent name from the trace→agent join for LLM-kind rows that carry no
 * `gen_ai.agent.name` of their own.
 */
export const parsePromptRecords = (
  records: PromptRecord[],
  traceAgent: Map<string, string>,
): PromptRow[] => {
  const prompts: PromptRow[] = [];
  for (const r of records) {
    const spanId = typeof r.span_id === "string" ? r.span_id : null;
    const traceId = typeof r.trace_id === "string" ? r.trace_id : null;
    const evalHallucination =
      typeof r.eval_hallucination === "number" ? r.eval_hallucination : null;
    const evalCorrectness =
      typeof r.eval_correctness === "number" ? r.eval_correctness : null;
    const evalFaithfulness =
      typeof r.eval_faithfulness === "number" ? r.eval_faithfulness : null;
    const evalRelevance =
      typeof r.eval_relevance === "number" ? r.eval_relevance : null;

    const modelLabel = r.model ? canonicalizeModel(r.model).label : null;
    const inTok = num(r.in_tok);
    const outTok = num(r.out_tok);
    const inCost = inTok > 0 ? costOf(inTok, 0, modelLabel) : 0;
    const outCost = outTok > 0 ? costOf(0, outTok, modelLabel) : 0;

    prompts.push({
      id: spanId ?? `${traceId ?? "?"}-${prompts.length}`,
      timestampMs: parseTimestampOrNow(r.timestamp),
      kind: r.kind === "Agent" ? "Agent" : "LLM",
      typeLabel: str(r.type_label) || "completion",
      service: str(r.service),
      serviceId: str(r.service_id),
      provider: r.provider ?? null,
      model: modelLabel,
      agent: r.agent ?? (traceId ? traceAgent.get(traceId) ?? null : null),
      temperature: typeof r.temperature === "number" ? r.temperature : null,
      inTokens: inTok,
      outTokens: outTok,
      inCost,
      outCost,
      durationMs: num(r.duration_ms),
      promptText: str(r.prompt_text),
      responseText: str(r.response_text),
      systemPrompt: r.system_prompt ?? null,
      piiDetected: bool(r.pii_detected),
      hasWarning: bool(r.has_warning),
      hasError: bool(r.has_error),
      truncated: bool(r.truncated),
      evalHallucination,
      evalCorrectness,
      evalFaithfulness,
      evalRelevance,
      traceId,
      spanId,
    });
  }
  return prompts;
};

// ---------------------------------------------------------------------------
// usePromptSummary — KPI tiles aggregate
// ---------------------------------------------------------------------------

export const SAMPLE_SIZE = 200;

/** Map the aggregate query row to the totals PromptsTilesRow renders. */
export const buildPromptSummary = (
  row: SummaryRecord | undefined,
): Omit<PromptSummary, "isLoading" | "error"> => {
  const total = num(row?.total);
  return {
    total,
    sampleSize: Math.min(SAMPLE_SIZE, total),
    avgDurationMs: num(row?.avg_duration_ms),
    avgInputTokens: num(row?.avg_input_tokens),
    avgOutputTokens: num(row?.avg_output_tokens),
    piiDetected: num(row?.pii_detected),
    warnings: num(row?.warnings),
    errors: num(row?.errors),
    truncated: num(row?.truncated),
  };
};

// ---------------------------------------------------------------------------
// usePromptQuality — quality-analytics aggregate
// ---------------------------------------------------------------------------

/** Map the aggregate eval query row to the quality panel's snapshot shape. */
export const buildPromptQuality = (
  row: QualityRecord | undefined,
): Omit<PromptQuality, "isLoading" | "error"> => {
  const hallucCov = num(row?.with_halluc);
  const correctCov = num(row?.with_correct);
  const faithCov = num(row?.with_faith);
  const relCov = num(row?.with_rel);
  const hasAnyEval = hallucCov + correctCov + faithCov + relCov > 0;

  return {
    totalLlmSpans: num(row?.total),
    hallucination: {
      pct: hallucCov === 0 ? null : optionalNum(row?.hallucination_pct),
      coverage: hallucCov,
      attribute: "gen_ai.evaluation.hallucination",
    },
    correctness: {
      pct: correctCov === 0 ? null : optionalNum(row?.correctness_pct),
      coverage: correctCov,
      attribute: "gen_ai.evaluation.correctness",
    },
    faithfulness: {
      pct: faithCov === 0 ? null : optionalNum(row?.faithfulness_pct),
      coverage: faithCov,
      attribute: "gen_ai.evaluation.faithfulness",
    },
    relevance: {
      pct: relCov === 0 ? null : optionalNum(row?.relevance_pct),
      coverage: relCov,
      attribute: "gen_ai.evaluation.relevance",
    },
    hasAnyEval,
  };
};

// ---------------------------------------------------------------------------
// useTraceSpans — trace/topology waterfall
// ---------------------------------------------------------------------------

/** Derived helper columns added by buildTraceSpansQuery (not real span
 *  attributes) — stripped from the attribute map so the panel only shows true
 *  span data. */
const DERIVED_SPAN_KEYS = new Set([
  "dur_ms",
  "cpu_ms",
  "cpu_self_ms",
  "in_tok",
  "out_tok",
  "has_error",
  "svc",
]);

/**
 * Map raw DQL rows (buildTraceSpansQuery's shape — every raw span attribute
 * plus the derived helper fields) to TraceSpan[].
 */
export const parseTraceSpanRecords = (
  records: Record<string, unknown>[],
): TraceSpan[] => {
  const spans: TraceSpan[] = [];
  for (const r of records) {
    const nOrNull = (v: unknown): number | null => (v == null ? null : num(v));
    // Raw span attributes minus the derived query helpers, for the panel.
    const attributes: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (!DERIVED_SPAN_KEYS.has(k)) attributes[k] = v;
    }
    spans.push({
      spanId: strShallow(r["span.id"]),
      parentSpanId: strOrNull(r["span.parent_id"]),
      name: strShallow(r["span.name"]),
      service:
        strShallow(r.svc) || strShallow(r["service.name"]) || strShallow(r["dt.service.name"]),
      durationMs: num(r.dur_ms),
      timestampMs: parseTimestampOrNow(r.start_time),
      endTimeMs: r.end_time == null ? null : parseTimestampOrNow(r.end_time),
      isError: bool(r.has_error),
      spanKind: strOrNull(r["span.kind"]),
      statusCode: strOrNull(r["span.status_code"]),
      isRoot:
        r["request.is_root_span"] == null ? null : bool(r["request.is_root_span"]),
      endpoint: strOrNull(r["endpoint.name"]),
      codeFunction: strOrNull(r["code.function"]),
      codeNamespace: strOrNull(r["code.namespace"]),
      cpuMs: r.cpu_ms == null ? null : nOrNull(r.cpu_ms),
      cpuSelfMs: r.cpu_self_ms == null ? null : nOrNull(r.cpu_self_ms),
      provider: strOrNull(r["gen_ai.system"]) ?? strOrNull(r["gen_ai.provider.name"]),
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
  return spans;
};

// ---------------------------------------------------------------------------
// useTraceLogs — trace-correlated logs
// ---------------------------------------------------------------------------

/** Map raw DQL rows (buildTraceLogsQuery's shape) to TraceLogLine[]. */
export const parseTraceLogRecords = (
  records: TraceLogRecord[],
): TraceLogLine[] => {
  const logs: TraceLogLine[] = [];
  for (const r of records) {
    logs.push({
      timestampMs: parseTimestampOrZero(r.timestamp),
      status: strShallow(r.status) || strShallow(r.loglevel) || "INFO",
      level: strShallow(r.loglevel),
      content: strShallow(r.content),
      spanId: r.span_id ?? null,
      source: strShallow(r.source),
      namespace: r.namespace ?? null,
    });
  }
  return logs;
};

// ---------------------------------------------------------------------------
// usePromptSpanDetail — Info tab
// ---------------------------------------------------------------------------

/** Map a raw DQL row (buildSpanDetailQuery's shape) to PromptSpanDetail. */
export const parseSpanDetailRecord = (
  r: SpanDetailRecord | undefined,
): PromptSpanDetail | null =>
  r
    ? {
        finishReason: strOrNull(r.finish_reason),
        temperature: r.temperature == null ? null : num(r.temperature),
        maxTokens: r.max_tokens == null ? null : num(r.max_tokens),
        statusCode: strOrNull(r.status_code),
        requestModel: strOrNull(r.request_model),
        responseModel: strOrNull(r.response_model),
        provider: strOrNull(r.provider),
        scope: strOrNull(r.scope),
        spanKind: strOrNull(r.span_kind),
      }
    : null;
