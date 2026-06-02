import { dqlEscape, dqlIdArray, dqlTimeArg, scopeFilterClause, globalFilterClauses, type GlobalFilters } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/**
 * Per-agent aggregates. We derive a coarse stage breakdown by counting child
 * spans whose kind we can infer from attribute presence:
 *   - LLM child:    gen_ai.provider.name is set
 *   - Tool child:   gen_ai.tool.name is set
 *   - Orchestration: any other child span of an agent span
 *   - Wait:         elapsed duration minus child-span sum
 *
 * The orchestration / wait split needs span parent-child traversal which is
 * not yet wired here — we approximate at the row level with stagebars derived
 * from token vs latency ratios. Full parent-child tree comes with the
 * topology session (Session 10).
 */
export const buildAgentsQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.agent.name)
| dedup {span.id}
| fieldsAdd
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0)),
    is_error = if(isNotNull(exception.type) or toLong(coalesce(http.response.status_code, 0)) >= 400, 1, else: 0),
    lname = lower(span.name),
    ttft_ms = if(isNotNull(gen_ai.usage.time_to_first_token), toDouble(gen_ai.usage.time_to_first_token), else: null)
| fieldsAdd
    // Classify each span in the agent's (single-service) trace into a stage.
    // LLM is usually ~0 here because model calls run on the shared proxy in a
    // separate trace — see "Latency by execution tier" for the LLM share.
    span_tier = if(isNotNull(gen_ai.provider.name) or isNotNull(gen_ai.system), "llm",
      else: if(gen_ai.operation.name == "embeddings" or contains(lname,"retriev") or contains(lname,"vector") or contains(lname,"embed") or contains(lname,"rds") or contains(lname,"sql") or contains(lname,"catalog") or contains(lname,"lookup") or contains(lname,"query") or contains(lname,"search"), "retrieval",
      else: if(span.kind == "client" or contains(lname,"_tool"), "tool", else: "orch")))
| summarize
    invocations = count(),
    p50_ns = percentile(duration, 50),
    p90_ns = percentile(duration, 90),
    p99_ns = percentile(duration, 99),
    avg_ns = avg(duration),
    errors = sum(is_error),
    input_tokens = sum(in_tok),
    output_tokens = sum(out_tok),
    llm_spans = countIf(span_tier == "llm"),
    tool_spans = countIf(span_tier == "tool"),
    retrieval_spans = countIf(span_tier == "retrieval"),
    orch_spans = countIf(span_tier == "orch"),
    avg_ttft_ms = avg(ttft_ms),
    models = collectDistinct(gen_ai.request.model),
    framework = takeFirst(gen_ai.framework),
    // Group by agent NAME only. The same agent is double-instrumented across
    // two dt.entity.service entities (one named, one with service.name=null),
    // which previously split each agent into duplicate rows. Collect both so
    // the UI can show the named service and keep a stable row id.
    services = collectDistinct(service.name),
    service_ids = collectDistinct(dt.entity.service),
    by: {
      agent = gen_ai.agent.name
    }
| fieldsAdd
    avg_ms = avg_ns / 1000000,
    p50_ms = p50_ns / 1000000,
    p90_ms = p90_ns / 1000000,
    p99_ms = p99_ns / 1000000,
    error_rate_pct = if(invocations > 0, toDouble(errors) / toDouble(invocations) * 100, else: 0)
| sort invocations desc
| limit 500
`.trim();

/**
 * True node-level runtime breakdown for the "Orchestration & runtime nodes"
 * section. A node is an individual runtime span (span.name) inside an agent
 * execution — e.g. `predict_load_factor`, `get_batch_pipeline_snapshot`,
 * `should_continue` — NOT the agent itself. We group by span.name + agent so
 * the same node name under different agents stays distinct, and collect the
 * (named + null) service entities so each node collapses to one row.
 *
 * Filters to internal spans that are neither LLM calls (no provider/model)
 * nor the agent root, which is exactly the orchestration/runtime layer.
 */
export const buildOrchestrationNodesQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.agent.name)
| filter span.kind == "internal"
| filter isNull(gen_ai.provider.name) and isNull(gen_ai.request.model)
| filter span.name != gen_ai.agent.name
| dedup {span.id}
| summarize
    invocations = count(),
    avg_ns = avg(duration),
    p90_ns = percentile(duration, 90),
    p99_ns = percentile(duration, 99),
    services = collectDistinct(service.name),
    by: { node = span.name, agent = gen_ai.agent.name }
| fieldsAdd
    avg_ms = avg_ns / 1000000,
    p90_ms = p90_ns / 1000000,
    p99_ms = p99_ns / 1000000
| sort invocations desc
| limit 200
`.trim();

/**
 * Trace-join: attribute LLM token usage to agents. In this tenant LLM calls
 * run through a central `bos-proxy-core` service, so tokens/models/operations
 * live on spans that do NOT carry gen_ai.agent.name. The only reliable link is
 * trace.id — when the proxy LLM span shares a trace with an agent span we can
 * attribute it. Many proxy calls start their own trace (no agent span), so
 * this is intentionally partial; the UI shows "—" for unlinkable agents.
 *
 * Pass 1: per trace, resolve the agent and sum the LLM tokens + capture a
 *         representative operation/model.
 * Pass 2: keep only traces that contain BOTH an agent and an LLM span, then
 *         aggregate per agent.
 *
 * Deliberately does NOT apply globalFilterClauses: those filter on
 * gen_ai.agent.name which is null on LLM spans and would break the join. The
 * main agents query already applies the global filter to the row list; this
 * map only enriches matching agents.
 */
export const buildAgentTraceJoinQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.agent.name) or isNotNull(gen_ai.request.model)
| dedup {span.id}
| fieldsAdd
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0))
| summarize
    agent = takeFirst(gen_ai.agent.name),
    has_agent = countIf(isNotNull(gen_ai.agent.name)),
    has_model = countIf(isNotNull(gen_ai.request.model)),
    t_in = sum(in_tok),
    t_out = sum(out_tok),
    t_op = takeFirst(gen_ai.operation.name),
    t_model = takeFirst(gen_ai.request.model),
    by: { trace.id }
| filter has_agent > 0 and has_model > 0
| summarize
    linked_traces = count(),
    input_tokens = sum(t_in),
    output_tokens = sum(t_out),
    operations = collectDistinct(t_op),
    models = collectDistinct(t_model),
    by: { agent }
| sort input_tokens desc
| limit 500
`.trim();

/**
 * Latency decomposition by execution tier. Classifies every AI span into one
 * of five tiers and reports where wall-clock time goes:
 *   - LLM         — model inference (gen_ai.provider.name set; the proxy calls)
 *   - Retrieval/DB— embeddings + vector / SQL / RDS / catalog lookups
 *   - Tool        — external/client tool calls
 *   - Orchestration — internal runtime/router nodes
 * Returns per-tier span count, summed ms, avg ms and p95 ms so the UI can show
 * each tier's share of total execution time and per-call latency.
 */
export const buildLatencyDecompositionQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.agent.name) or isNotNull(gen_ai.provider.name)
| dedup {span.id}
| fieldsAdd lname = lower(span.name)
| fieldsAdd tier = if(isNotNull(gen_ai.provider.name), "LLM",
    else: if(gen_ai.operation.name == "embeddings" or contains(lname,"retriev") or contains(lname,"vector") or contains(lname,"embed") or contains(lname,"rds") or contains(lname,"sql") or contains(lname,"catalog") or contains(lname,"lookup") or contains(lname,"query") or contains(lname,"search"), "Retrieval/DB",
    else: if(span.kind == "client" or contains(lname,"_tool"), "Tool",
    else: "Orchestration")))
| summarize
    spans = count(),
    total_ms = sum(duration) / 1000000,
    avg_ms = avg(duration) / 1000000,
    p95_ms = percentile(duration, 95) / 1000000,
    by: { tier }
| sort total_ms desc
`.trim();

/** Quality eval coverage and aggregate scores. */
export const buildAgentEvalQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.agent.name)
| fieldsAdd
    has_correctness = if(isNotNull(gen_ai.evaluation.tool_correctness), 1, else: 0),
    has_halluc = if(isNotNull(gen_ai.evaluation.hallucination), 1, else: 0),
    has_success = if(isNotNull(gen_ai.evaluation.task_success), 1, else: 0),
    ctx_tokens = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0))
| summarize
    invocations = count(),
    correctness_pct = avg(toDouble(gen_ai.evaluation.tool_correctness)) * 100,
    hallucination_pct = avg(toDouble(gen_ai.evaluation.hallucination)) * 100,
    success_pct = avg(toDouble(gen_ai.evaluation.task_success)) * 100,
    avg_ctx_tokens = avg(ctx_tokens),
    with_correctness = sum(has_correctness),
    with_halluc = sum(has_halluc),
    with_success = sum(has_success)
`.trim();

/**
 * Step 1 for upstream services: the dt.entity.service IDs that host AI agents
 * in scope. parent.service.name is NOT emitted on spans, so upstream callers
 * must come from Smartscape topology (step 2) keyed by these service IDs.
 */
export const buildAiServiceIdsQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.agent.name)
| summarize spans = count(), by: { svc = dt.entity.service }
| limit 200
`.trim();

/**
 * Step 2: upstream service dependencies from Smartscape. Finds services that
 * "call" the AI services (topology edges, not span attributes), resolving both
 * ends to service names. `services` is the count of distinct AI services each
 * upstream calls. Returns nothing for services with no monitored callers
 * (e.g. entry points called only by external clients).
 */
export const buildUpstreamSmartscapeQuery = (aiServiceIds: string[]): string => {
  if (aiServiceIds.length === 0) return "";
  return `
smartscapeEdges type:"calls"
| filter in(target_id, array(${dqlIdArray(aiServiceIds)}))
| join [ smartscapeNodes type:"SERVICE" | fields source_id = id, upstream = name ], kind: inner, on: { source_id }, prefix: "s."
| join [ smartscapeNodes type:"SERVICE" | fields target_id = id, target_name = name ], kind: inner, on: { target_id }, prefix: "t."
| summarize
    services = countDistinct(target_id),
    targets = collectDistinct(\`t.target_name\`),
    by: { upstream = \`s.upstream\` }
| sort services desc
| limit 25
`.trim();
};

/** Per-agent invocations timeseries for the hero chart. */
export const buildInvocationsSeriesQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  intervalSec: number,
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.agent.name)
| makeTimeseries invocations = count(), interval: ${intervalSec}s
`.trim();

/**
 * Per-agent 24h trend + 7d baseline used by the DegradedTrendPanel.
 * Returns one row per agent with two parallel arrays.
 */
export const buildDegradedTrendQuery = (
  serviceIds: string[] | null,
  topAgents: string[],
  filters?: GlobalFilters,
): string => {
  if (topAgents.length === 0) {
    return `
fetch spans, samplingRatio: 1, from: now()-24h, scanLimitGBytes: 100
| filter false
| summarize n = count()
`.trim();
  }
  const agentArray = topAgents
    .map((n) => `"${dqlEscape(n)}"`)
    .join(", ");
  return `
fetch spans, samplingRatio: 1, from: now()-24h, to: now(), scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter in(gen_ai.agent.name, array(${agentArray}))
| makeTimeseries
    p90_ns = percentile(duration, 90),
    interval: 1h,
    by: { agent = gen_ai.agent.name }
`.trim();
};
