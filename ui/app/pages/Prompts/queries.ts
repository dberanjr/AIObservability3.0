import { dqlEscape, dqlIdArray, dqlTimeArg, scopeFilterClause, globalFilterClauses, type GlobalFilters } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/** Response-time (duration) filter expressed in milliseconds. */
export interface LatencyFilter {
  op: "gt" | "lt" | "between";
  min?: number;
  max?: number;
}

/** Sidebar facet selections applied server-side so the 200-row cap is taken
 *  AFTER filtering (not before). Service + kind + search + provider + operation
 *  + status (errors/pii/warnings/truncated) + latency + agent are pushed into
 *  DQL; only model stays client-side (it needs canonical-label mapping). */
export interface PromptsSidebarFilter {
  services?: string[];
  kinds?: string[];
  search?: string;
  providers?: string[];
  operations?: string[];
  /** Agent names. LLM spans carry no gen_ai.agent.name, so this filters by the
   *  agent's trace.ids via a server-side join (see buildPromptsListQuery). */
  agents?: string[];
  onlyErrors?: boolean;
  onlyPii?: boolean;
  onlyWarnings?: boolean;
  /** Only responses cut off by the max-tokens limit (finish_reasons max_tokens). */
  onlyTruncated?: boolean;
  latency?: LatencyFilter;
  temperature?: LatencyFilter;
}

const SVC_EXPR = `coalesce(service.name, getNodeName(dt.smartscape.service))`;
const PROVIDER_EXPR = `coalesce(gen_ai.system, gen_ai.provider.name)`;

/** Build the server-side clauses for the extended sidebar filters. */
const sidebarClauses = (sidebar?: PromptsSidebarFilter): string => {
  const lines: string[] = [];
  if (sidebar?.providers?.length) {
    lines.push(
      `| filter in(${PROVIDER_EXPR}, array(${dqlIdArray(sidebar.providers)}))`,
    );
  }
  if (sidebar?.operations?.length) {
    lines.push(
      `| filter in(gen_ai.operation.name, array(${dqlIdArray(sidebar.operations)}))`,
    );
  }
  if (sidebar?.onlyErrors) {
    lines.push(
      `| filter isNotNull(exception.type) or span.status_code == "error"`,
    );
  }
  if (sidebar?.onlyPii) {
    lines.push(`| filter toBoolean(gen_ai.privacy.pii_detected) == true`);
  }
  if (sidebar?.onlyWarnings) {
    lines.push(`| filter toBoolean(gen_ai.response.warning) == true`);
  }
  if (sidebar?.onlyTruncated) {
    lines.push(
      `| filter contains(toString(gen_ai.response.finish_reasons), "max_tokens")`,
    );
  }
  const lat = sidebar?.latency;
  if (lat) {
    // `duration` is a DQL duration-typed column — it must be compared against a
    // duration literal (e.g. `3000ms`), NOT a raw nanosecond integer (that
    // silently matches nothing). The UI specifies milliseconds.
    const ms = (v: number) => `${Math.max(0, Math.round(v))}ms`;
    if (lat.op === "gt" && lat.min != null) {
      lines.push(`| filter duration > ${ms(lat.min)}`);
    } else if (lat.op === "lt" && lat.max != null) {
      lines.push(`| filter duration < ${ms(lat.max)}`);
    } else if (lat.op === "between" && lat.min != null && lat.max != null) {
      lines.push(`| filter duration >= ${ms(lat.min)} and duration <= ${ms(lat.max)}`);
    }
  }
  // Temperature is a plain numeric attribute (0–1+), compared directly.
  const temp = sidebar?.temperature;
  if (temp) {
    const T = "gen_ai.request.temperature";
    const num = (v: number) => Number(v);
    if (temp.op === "gt" && temp.min != null && Number.isFinite(temp.min)) {
      lines.push(`| filter ${T} > ${num(temp.min)}`);
    } else if (temp.op === "lt" && temp.max != null && Number.isFinite(temp.max)) {
      lines.push(`| filter ${T} < ${num(temp.max)}`);
    } else if (
      temp.op === "between" &&
      temp.min != null &&
      temp.max != null &&
      Number.isFinite(temp.min) &&
      Number.isFinite(temp.max)
    ) {
      lines.push(`| filter ${T} >= ${num(temp.min)} and ${T} <= ${num(temp.max)}`);
    }
  }
  return lines.join("\n");
};

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
  const extraClauses = sidebarClauses(sidebar);
  // Agent filter: gen_ai.agent.name is null on LLM/prompt spans, so we can't
  // filter them directly. Instead inner-join to the trace.ids that carry the
  // selected agent(s) — keeping only prompt spans from those agents' traces.
  // Server-side (before the 200-row cap), so it doesn't depend on the sample.
  const agentClause = sidebar?.agents?.length
    ? `| join [
    fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
    | filter in(gen_ai.agent.name, array(${dqlIdArray(sidebar.agents)}))
    | summarize ag_keep = count(), by: { trace.id }
  ], on: { trace.id }, kind: inner, prefix: "ag_"`
    : "";
  // The content filter (drop tokens-only proxy spans) is relaxed when a status
  // tile is active: truncated / PII / warning spans in this tenant are proxy
  // spans with NO captured content, so requiring content would hide every one.
  const statusFilterActive = Boolean(
    sidebar?.onlyTruncated ||
      sidebar?.onlyPii ||
      sidebar?.onlyWarnings ||
      sidebar?.onlyErrors,
  );
  const contentClause = statusFilterActive
    ? ""
    : `| filter prompt_text != "" or response_text != "" or span.status_code == "error"`;
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
// An LLM "prompt" span = has a provider/system and is a chat/completion call.
// This matches both instrumentation paths (proxy gen_ai.provider.name and
// LangChain gen_ai.system) and is the convention the platform AI app uses.
| filter isNotNull(gen_ai.system) or isNotNull(gen_ai.provider.name)
| filter isNull(llm.request.type) or in(llm.request.type, {"chat", "completion"})
${svcClause}
${kindClause}
${extraClauses}
${agentClause}
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
    truncated = if(contains(toString(gen_ai.response.finish_reasons), "max_tokens"), true, else: false),
    type_label = coalesce(llm.request.type, gen_ai.operation.name, "chat"),
    model_name = coalesce(gen_ai.response.model, gen_ai.request.model, gen_ai.model, ""),
    eval_hallucination = toDouble(gen_ai.evaluation.hallucination),
    eval_correctness = toDouble(gen_ai.evaluation.correctness),
    eval_faithfulness = toDouble(gen_ai.evaluation.faithfulness),
    eval_relevance = toDouble(gen_ai.evaluation.relevance)
| fieldsAdd kind = if(isNotNull(gen_ai.agent.name), "Agent", else: "LLM")
// Keep only rows that carry a prompt or response (or are errors). This drops
// the central-proxy spans, which have tokens but no content. Relaxed when a
// status tile (truncated/pii/warning/error) is active — those target the
// content-less proxy spans, so the requirement is dropped there.
${contentClause}
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
    temperature = gen_ai.request.temperature,
    in_tok,
    out_tok,
    duration_ms,
    prompt_text,
    response_text,
    system_prompt,
    pii_detected,
    has_warning,
    has_error,
    truncated,
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
 * Distinct facet values for the sidebar — discovered SERVER-SIDE across all
 * AI spans (not just the 200 content rows). This is why the Agent facet was
 * empty before: agent names live on agent-type spans, which the content-row
 * projection never includes. One scan, collectDistinct per attribute.
 */
export const buildPromptFacetValuesQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.system) or isNotNull(gen_ai.provider.name) or isNotNull(gen_ai.agent.name)
| summarize
    agents = collectDistinct(gen_ai.agent.name),
    models = collectDistinct(coalesce(gen_ai.response.model, gen_ai.request.model, gen_ai.model)),
    providers = collectDistinct(${PROVIDER_EXPR}),
    operations = collectDistinct(gen_ai.operation.name),
    services = collectDistinct(${SVC_EXPR})
`.trim();

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
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
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
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.system) or isNotNull(gen_ai.provider.name)
| filter isNull(llm.request.type) or in(llm.request.type, {"chat", "completion"})
| fieldsAdd
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0)),
    pii = if(coalesce(toBoolean(gen_ai.privacy.pii_detected), false), 1, else: 0),
    warn = if(coalesce(toBoolean(gen_ai.response.warning), false), 1, else: 0),
    err = if(isNotNull(exception.type) or span.status_code == "error", 1, else: 0),
    trunc = if(contains(toString(gen_ai.response.finish_reasons), "max_tokens"), 1, else: 0)
| summarize
    total = count(),
    avg_duration_ms = avg(duration) / 1000000,
    avg_input_tokens = avg(in_tok),
    avg_output_tokens = avg(out_tok),
    pii_detected = sum(pii),
    warnings = sum(warn),
    errors = sum(err),
    truncated = sum(trunc)
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
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
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
 * Bracket a fetch window around a known epoch-ms timestamp (±30m). Grail is
 * time-partitioned, so scoping the window to the record's time turns a 24h
 * scan into a tiny one — and a trace older than 24h (the previous fixed
 * window) is found at all. Falls back to now()-24h when no timestamp is known.
 */
const traceWindow = (
  startMs?: number,
): { from: string; to: string } => {
  if (typeof startMs === "number" && Number.isFinite(startMs)) {
    const pad = 30 * 60 * 1000;
    return {
      from: `"${new Date(startMs - pad).toISOString()}"`,
      to: `"${new Date(startMs + pad).toISOString()}"`,
    };
  }
  return { from: "now()-24h", to: "now()" };
};

/**
 * Fetches all spans within a trace for the detail panel trace tree view.
 * Used to build the span hierarchy and show metadata for each span.
 *
 * `trace.id` is a `uid`-typed column, so it must be compared with `toUid(...)`
 * — comparing it to a bare string literal silently matches nothing (this was
 * the bug that left the Trace tab perpetually empty).
 */
export const buildTraceSpansQuery = (
  traceId: string,
  startMs?: number,
): string => {
  const { from, to } = traceWindow(startMs);
  return `
fetch spans, samplingRatio: 1, from: ${from}, to: ${to}
| filter trace.id == toUid("${dqlEscape(traceId)}")
| dedup {span.id}
| fieldsAdd
    duration_ms = duration / 1000000,
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0))
| fields
    span_id = span.id,
    parent_span_id = span.parent_id,
    name = span.name,
    service = coalesce(service.name, getNodeName(dt.smartscape.service)),
    duration_ms,
    timestamp = start_time,
    end_time,
    has_error = if(isNotNull(exception.type) or span.status_code == "error", true, else: false),
    span_kind = span.kind,
    status_code = span.status_code,
    is_root = request.is_root_span,
    endpoint = endpoint.name,
    code_function = code.function,
    code_namespace = code.namespace,
    cpu_ms = span.timing.cpu / 1000000,
    cpu_self_ms = span.timing.cpu_self / 1000000,
    gen_ai_provider = coalesce(gen_ai.system, gen_ai.provider.name),
    gen_ai_model = coalesce(gen_ai.request.model, gen_ai.response.model, gen_ai.model),
    gen_ai_operation = gen_ai.operation.name,
    agent_name = gen_ai.agent.name,
    tool_name = gen_ai.tool.name,
    in_tok,
    out_tok,
    exception_type = exception.type,
    exception_msg = exception.message,
    workflow = traceloop.workflow.name,
    tl_entity = traceloop.entity.name,
    tl_entity_path = traceloop.entity.path,
    tl_kind = traceloop.span.kind,
    session_id = dt.rum.session.id,
    mcp_method = mcp.method.name
| sort timestamp asc
| limit 100
`.trim();
};

/**
 * Logs correlated to a trace, for the detail panel's Logs tab. Logs carry
 * `trace_id` / `span_id` as plain string fields (hex, not uid), so we match
 * `trace_id` by string equality. Scoped to ±30m around the prompt timestamp to
 * keep the (very large) logs table scan bounded. Returns up to 200 rows; the
 * UI paginates them 10 at a time.
 */
export const buildTraceLogsQuery = (
  traceId: string,
  startMs?: number,
): string => {
  const { from, to } = traceWindow(startMs);
  return `
fetch logs, from: ${from}, to: ${to}
| filter trace_id == "${dqlEscape(traceId)}"
| fields
    timestamp,
    status,
    loglevel,
    content,
    span_id,
    source = coalesce(log.source, dt.process.name, k8s.namespace.name, ""),
    namespace = k8s.namespace.name
| sort timestamp asc
| limit 200
`.trim();
};

/**
 * Full detail for a single span (the popup's Info tab). Enriches the row with
 * attributes not carried in the list projection — finish reason, sampling
 * params, status, scope, and both request/response models.
 */
export const buildSpanDetailQuery = (
  spanId: string,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
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
fetch logs, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
| filter span_id == toUid("${dqlEscape(spanId)}")
| summarize error_logs = countIf(status == "ERROR"), warning_logs = countIf(status == "WARN"), total = count()
`.trim();

void dqlEscape;
