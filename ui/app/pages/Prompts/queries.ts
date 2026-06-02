import { dqlEscape, dqlIdArray, dqlTimeArg, scopeFilterClause, globalFilterClauses, type GlobalFilters } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/** Sidebar facet selections applied server-side so the 200-row cap is taken
 *  AFTER filtering (not before). Service + kind + search are pushed into DQL;
 *  model/agent stay client-side (canonical label / trace-backfilled). */
export interface PromptsSidebarFilter {
  services?: string[];
  kinds?: string[];
  search?: string;
}

const SVC_EXPR = `coalesce(service.name, getNodeName(dt.smartscape.service))`;

/**
 * Per-prompt rows for the Stream / Metadata views. Reads a small set of
 * canonical attribute paths; falls back to coalesce when teams emit either
 * `gen_ai.prompt.0.content` or `gen_ai.prompt.content`. Sampled to 200 rows.
 */
export const buildPromptsListQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  filters?: GlobalFilters,
  sidebar?: PromptsSidebarFilter,
): string => {
  const svcClause = sidebar?.services?.length
    ? `| filter in(${SVC_EXPR}, array(${dqlIdArray(sidebar.services)}))`
    : "";
  const kinds = sidebar?.kinds ?? [];
  const kindClause =
    kinds.length === 1
      ? kinds[0] === "Agent"
        ? "| filter isNotNull(gen_ai.agent.name)"
        : "| filter isNull(gen_ai.agent.name)"
      : "";
  const q = (sidebar?.search ?? "").trim().toLowerCase();
  const searchClause = q
    ? `| filter contains(lower(prompt_text), "${dqlEscape(q)}") or contains(lower(response_text), "${dqlEscape(q)}") or contains(lower(coalesce(system_prompt, "")), "${dqlEscape(q)}")`
    : "";
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
// An LLM "prompt" span = has a provider/system and is a chat/completion call.
// This matches both instrumentation paths (proxy gen_ai.provider.name and
// LangChain gen_ai.system) and is the convention the platform AI app uses.
| filter isNotNull(gen_ai.system) or isNotNull(gen_ai.provider.name)
| filter isNull(llm.request.type) or in(llm.request.type, {"chat", "completion"})
${svcClause}
${kindClause}
// Collapse duplicate span records (this tenant double-emits some spans).
| dedup {span.id}
| fieldsAdd
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0)),
    duration_ms = duration / 1000000,
    ai_provider = coalesce(gen_ai.system, gen_ai.provider.name),
    // User/input message — handle message arrays and role-positioned prompts.
    prompt_text = coalesce(
      gen_ai.input.messages,
      gen_ai.prompt.0.user,
      if(gen_ai.prompt.2.role == "user", gen_ai.prompt.2.content),
      if(gen_ai.prompt.1.role == "user", gen_ai.prompt.1.content),
      if(gen_ai.prompt.0.role == "user", gen_ai.prompt.0.content),
      gen_ai.prompt.0.content,
      ""
    ),
    response_text = coalesce(
      gen_ai.output.messages,
      gen_ai.completion.0.content,
      gen_ai.response.content,
      ""
    ),
    system_prompt = coalesce(
      gen_ai.system_instructions,
      if(gen_ai.prompt.0.role == "system", gen_ai.prompt.0.content),
      if(gen_ai.prompt.1.role == "system", gen_ai.prompt.1.content),
      if(gen_ai.prompt.2.role == "system", gen_ai.prompt.2.content)
    ),
    pii_detected = coalesce(toBoolean(gen_ai.privacy.pii_detected), false),
    has_warning = coalesce(toBoolean(gen_ai.response.warning), false),
    has_error = if(isNotNull(exception.type) or span.status_code == "error", true, else: false),
    type_label = coalesce(llm.request.type, gen_ai.operation.name, "chat"),
    model_name = coalesce(gen_ai.response.model, gen_ai.request.model, gen_ai.model, ""),
    eval_hallucination = toDouble(gen_ai.evaluation.hallucination),
    eval_correctness = toDouble(gen_ai.evaluation.correctness),
    eval_faithfulness = toDouble(gen_ai.evaluation.faithfulness),
    eval_relevance = toDouble(gen_ai.evaluation.relevance)
| fieldsAdd kind = if(isNotNull(gen_ai.agent.name), "Agent", else: "LLM")
// Keep only rows that carry a prompt or response (or are errors). This drops
// the central-proxy spans, which have tokens but no content.
| filter prompt_text != "" or response_text != "" or span.status_code == "error"
${searchClause}
| fields
    timestamp = start_time,
    kind,
    type_label,
    provider = ai_provider,
    service = coalesce(service.name, getNodeName(dt.smartscape.service)),
    service_id = coalesce(dt.smartscape.service, dt.entity.service),
    model = model_name,
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
};

/**
 * Trace → agent map. LLM-call spans (gen_ai.provider.name) carry no
 * gen_ai.agent.name in this tenant, so the prompts list can't show which agent
 * issued a call directly. This resolves the owning agent per trace.id so the
 * hook can backfill it — fixing the "only one agent shows" symptom.
 */
export const buildPromptAgentMapQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.agent.name)
| summarize agent = takeFirst(gen_ai.agent.name), by: { trace_id = trace.id }
| limit 5000
`.trim();

/**
 * Aggregate counts/averages for the 6-tile summary row.
 */
export const buildPromptsSummaryQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.system) or isNotNull(gen_ai.provider.name)
| filter isNull(llm.request.type) or in(llm.request.type, {"chat", "completion"})
| fieldsAdd
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0)),
    pii = if(coalesce(toBoolean(gen_ai.privacy.pii_detected), false), 1, else: 0),
    warn = if(coalesce(toBoolean(gen_ai.response.warning), false), 1, else: 0),
    err = if(isNotNull(exception.type) or span.status_code == "error", 1, else: 0)
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
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
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
| dedup {span.id}
| fieldsAdd
    duration_ms = duration / 1000000,
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0))
| fields
    span_id = span.id,
    parent_span_id = span.parent_id,
    name = span.name,
    service = service.name,
    duration_ms,
    timestamp = start_time,
    has_error = if(isNotNull(exception.type) or span.status_code == "error", true, else: false),
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

/**
 * Full detail for a single span (the popup's Info tab). Enriches the row with
 * attributes not carried in the list projection — finish reason, sampling
 * params, status, scope, and both request/response models.
 */
export const buildSpanDetailQuery = (
  spanId: string,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 200
| filter span.id == toUid("${dqlEscape(spanId)}")
| fields
    finish_reason = coalesce(gen_ai.completion.0.finish_reason, toString(gen_ai.response.finish_reasons)),
    temperature = gen_ai.request.temperature,
    max_tokens = gen_ai.request.max_tokens,
    status_code = span.status_code,
    request_model = gen_ai.request.model,
    response_model = gen_ai.response.model,
    provider = coalesce(gen_ai.system, gen_ai.provider.name),
    scope = otel.scope.name,
    span_kind = span.kind
| limit 1
`.trim();

/** Per-span log counts (ERROR / WARN) for the popup, keyed by span_id. */
export const buildSpanLogsQuery = (
  spanId: string,
  timeframe: Timeframe,
): string => `
fetch logs, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 200
| filter span_id == toUid("${dqlEscape(spanId)}")
| summarize error_logs = countIf(status == "ERROR"), warning_logs = countIf(status == "WARN"), total = count()
`.trim();

void dqlEscape;
