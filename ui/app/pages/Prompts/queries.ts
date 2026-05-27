import { dqlEscape, dqlTimeArg, scopeFilterClause } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/**
 * Per-prompt rows for the Stream / Metadata views. Reads a small set of
 * canonical attribute paths; falls back to coalesce when teams emit either
 * `gen_ai.prompt.0.content` or `gen_ai.prompt.content`. Sampled to 200 rows.
 */
export const buildPromptsListQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name) or isNotNull(gen_ai.agent.name)
| fieldsAdd
    kind = if(isNotNull(gen_ai.provider.name), "LLM", else: "Agent"),
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0)),
    duration_ms = duration / 1000000,
    prompt_text = coalesce(
      gen_ai.prompt.0.content,
      gen_ai.prompt.content,
      gen_ai.prompt,
      ""
    ),
    response_text = coalesce(
      gen_ai.completion.0.content,
      gen_ai.response.content,
      gen_ai.completion,
      ""
    ),
    system_prompt = if(gen_ai.prompt.0.role == "system", gen_ai.prompt.0.content, else: null),
    pii_detected = coalesce(toBoolean(gen_ai.privacy.pii_detected), false),
    has_warning = coalesce(toBoolean(gen_ai.response.warning), false),
    has_error = if(isNotNull(exception.type), true, else: false),
    type_label = coalesce(gen_ai.operation.name, gen_ai.kind, "completion"),
    eval_hallucination = toDouble(gen_ai.evaluation.hallucination),
    eval_correctness = toDouble(gen_ai.evaluation.correctness),
    eval_faithfulness = toDouble(gen_ai.evaluation.faithfulness),
    eval_relevance = toDouble(gen_ai.evaluation.relevance)
| fields
    timestamp,
    kind,
    type_label,
    service = service.name,
    service_id = dt.entity.service,
    model = gen_ai.request.model,
    agent = gen_ai.agent.name,
    in_tok,
    out_tok,
    duration_ms,
    prompt_text,
    response_text,
    system_prompt,
    pii_detected,
    has_warning,
    has_error,
    eval_hallucination,
    eval_correctness,
    eval_faithfulness,
    eval_relevance,
    trace_id = trace.id,
    span_id = span.id
| sort timestamp desc
| limit 200
`.trim();

/**
 * Aggregate counts/averages for the 6-tile summary row.
 */
export const buildPromptsSummaryQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name) or isNotNull(gen_ai.agent.name)
| fieldsAdd
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0)),
    pii = if(coalesce(toBoolean(gen_ai.privacy.pii_detected), false), 1, else: 0),
    warn = if(coalesce(toBoolean(gen_ai.response.warning), false), 1, else: 0),
    err = if(isNotNull(exception.type), 1, else: 0)
| summarize
    total = count(),
    avg_duration_ms = avg(duration) / 1000000,
    avg_input_tokens = avg(in_tok),
    avg_output_tokens = avg(out_tok),
    pii_detected = sum(pii),
    warnings = sum(warn),
    errors = sum(err)
`.trim();

/**
 * Eval coverage + averages for the Prompt quality analytics section.
 * Returns NULL averages when the attribute isn't present — the UI surfaces
 * the empty-with-attribute-name guidance in that case.
 */
export const buildPromptQualityQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name)
| fieldsAdd
    has_halluc = if(isNotNull(gen_ai.evaluation.hallucination), 1, else: 0),
    has_correct = if(isNotNull(gen_ai.evaluation.correctness), 1, else: 0),
    has_faith = if(isNotNull(gen_ai.evaluation.faithfulness), 1, else: 0),
    has_rel = if(isNotNull(gen_ai.evaluation.relevance), 1, else: 0)
| summarize
    total = count(),
    hallucination_pct = avg(toDouble(gen_ai.evaluation.hallucination)) * 100,
    correctness_pct = avg(toDouble(gen_ai.evaluation.correctness)) * 100,
    faithfulness_pct = avg(toDouble(gen_ai.evaluation.faithfulness)) * 100,
    relevance_pct = avg(toDouble(gen_ai.evaluation.relevance)) * 100,
    with_halluc = sum(has_halluc),
    with_correct = sum(has_correct),
    with_faith = sum(has_faith),
    with_rel = sum(has_rel)
`.trim();

/**
 * Fetches all spans within a trace for the detail panel trace tree view.
 * Used to build the span hierarchy and show metadata for each span.
 */
export const buildTraceSpansQuery = (traceId: string): string => `
fetch spans, samplingRatio: 1, from: now()-24h, to: now(), scanLimitGBytes: 100
| filter trace.id == "${traceId}"
| fieldsAdd
    duration_ms = duration / 1000000,
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0))
| fields
    span_id = span.id,
    parent_span_id,
    name = span.name,
    service = service.name,
    duration_ms,
    timestamp,
    has_error = if(isNotNull(exception.type), true, else: false),
    gen_ai_provider = gen_ai.provider.name,
    gen_ai_model = gen_ai.request.model,
    gen_ai_operation = gen_ai.operation.name,
    agent_name = gen_ai.agent.name,
    tool_name = gen_ai.tool.name,
    in_tok,
    out_tok,
    exception_type = exception.type,
    exception_msg = exception.message,
    workflow = traceloop.workflow.name,
    session_id = dt.rum.session.id
| sort timestamp asc
| limit 100
`.trim();

void dqlEscape;
