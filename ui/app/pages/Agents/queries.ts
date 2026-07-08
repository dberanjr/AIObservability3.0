import { dqlEscape, dqlIdArray, dqlTimeArg, scopeFilterClause, globalFilterClauses, logicalErrorField, mcpNotLifecycleClause, type GlobalFilters } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";

export type { CandidateTrace, RepTrace } from "./representativeTraces";

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
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.agent.name)
| dedup {span.id}
| fieldsAdd
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0)),
    ${logicalErrorField()},
    lname = lower(span.name),
    ttft_ms = if(isNotNull(gen_ai.response.ttft) or isNotNull(gen_ai.usage.time_to_first_token) or isNotNull(gen_ai.response.time_to_first_chunk), toDouble(coalesce(gen_ai.response.ttft, gen_ai.usage.time_to_first_token, gen_ai.response.time_to_first_chunk)), else: null)
| fieldsAdd
    // Classify each span in the agent's (single-service) trace into a stage.
    // LLM is usually ~0 here because model calls run on the shared proxy in a
    // separate trace — see "Latency by execution tier" for the LLM share.
    span_tier = if(isNotNull(gen_ai.provider.name) or isNotNull(gen_ai.system), "llm",
      else: if(gen_ai.operation.name == "embeddings" or contains(lname,"retriev") or contains(lname,"vector") or contains(lname,"embed") or contains(lname,"rds") or contains(lname,"sql") or contains(lname,"catalog") or contains(lname,"lookup") or contains(lname,"query") or contains(lname,"search"), "retrieval",
      else: if((traceloop.span.kind == "tool" or isNotNull(gen_ai.tool.name) or mcp.method.name == "tools/call") and ${mcpNotLifecycleClause()}, "tool", else: "orch")))
| summarize
    // An invocation is one agent run, i.e. one trace — NOT one span. gen_ai.agent.name
    // propagates to every child span in the run (tool calls, LangGraph nodes, task
    // spans, …), so count() would tally the whole subtree (e.g. 49 spans for a single
    // run). Count distinct traces instead. errors is likewise trace-grained: a run
    // counts once if any of its spans errored, so error_rate_pct stays a 0–100% "share
    // of runs that failed" rather than a per-span ratio that could exceed 100%.
    invocations = countDistinct(trace.id),
    p50_ns = percentile(duration, 50),
    p90_ns = percentile(duration, 90),
    p99_ns = percentile(duration, 99),
    avg_ns = avg(duration),
    errors = countDistinct(if(is_error == 1, trace.id, else: null)),
    input_tokens = sum(in_tok),
    output_tokens = sum(out_tok),
    llm_spans = countIf(span_tier == "llm"),
    tool_spans = countIf(span_tier == "tool"),
    retrieval_spans = countIf(span_tier == "retrieval"),
    orch_spans = countIf(span_tier == "orch"),
    avg_ttft_ms = avg(ttft_ms),
    models = collectDistinct(gen_ai.request.model),
    fw_workflow = takeFirst(traceloop.workflow.name),
    fw_entity = takeFirst(traceloop.entity.name),
    fw_system = takeFirst(gen_ai.system),
    fw_span = takeFirst(span.name),
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
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
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
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
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
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.agent.name) or isNotNull(gen_ai.provider.name)
| dedup {span.id}
| fieldsAdd lname = lower(span.name)
| fieldsAdd tier = if(isNotNull(gen_ai.provider.name), "LLM",
    else: if(gen_ai.operation.name == "embeddings" or contains(lname,"retriev") or contains(lname,"vector") or contains(lname,"embed") or contains(lname,"rds") or contains(lname,"sql") or contains(lname,"catalog") or contains(lname,"lookup") or contains(lname,"query") or contains(lname,"search"), "Retrieval/DB",
    else: if((traceloop.span.kind == "tool" or isNotNull(gen_ai.tool.name) or mcp.method.name == "tools/call") and ${mcpNotLifecycleClause()}, "Tool",
    else: "Orchestration")))
| summarize
    spans = count(),
    total_ms = sum(duration) / 1000000,
    avg_ms = avg(duration) / 1000000,
    p95_ms = percentile(duration, 95) / 1000000,
    by: { tier }
| sort total_ms desc
`.trim();

/**
 * Agent loop detection (best-effort, from LangGraph execution attributes).
 *
 * A "run" is one graph execution (trace.id + agent). Within a run we count how
 * many node executions happened vs how many distinct nodes — a high ratio
 * means nodes are being revisited (a loop) — and the max step index reached
 * (deep iteration / potential non-termination). A run is flagged "looping"
 * when it revisits nodes heavily OR reaches a high step count.
 *
 * Heuristic: sharper with gen_ai.agent.iteration / max_iterations and a stable
 * thread_id (currently absent on this tenant) — see the data-gap note.
 */
export const LOOP_REPEAT_RATIO = 3;
export const LOOP_MAX_STEP = 25;

export const buildAgentLoopsQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(traceloop.association.properties.langgraph_node)
| dedup {span.id}
| summarize
    node_execs = count(),
    max_step = max(toLong(coalesce(traceloop.association.properties.langgraph_step, 0))),
    distinct_nodes = countDistinct(traceloop.association.properties.langgraph_node),
    by: { trace.id, agent = gen_ai.agent.name }
| fieldsAdd repeat_ratio = if(distinct_nodes > 0, toDouble(node_execs) / toDouble(distinct_nodes), else: 0.0)
| summarize
    runs = count(),
    looping_runs = countIf(repeat_ratio >= ${LOOP_REPEAT_RATIO}.0 or max_step >= ${LOOP_MAX_STEP}),
    max_repeat = round(max(repeat_ratio), decimals: 1),
    max_steps = max(max_step),
    avg_nodes_per_run = round(avg(toDouble(node_execs)), decimals: 1),
    by: { agent = coalesce(agent, "unattributed") }
| fieldsAdd loop_rate_pct = round(if(runs > 0, toDouble(looping_runs) / toDouble(runs) * 100, else: 0.0), decimals: 1)
| sort looping_runs desc, max_repeat desc
| limit 20
`.trim();

/** Quality eval coverage and aggregate scores. */
export const buildAgentEvalQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
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
 * Step 1 for upstream services: the dt.entity.service IDs of the in-scope AI
 * footprint. parent.service.name is NOT emitted on spans, so upstream callers
 * must come from Smartscape topology (step 2) keyed by these service IDs.
 *
 * Captures BOTH agent-hosting services (gen_ai.agent.name) AND LLM-calling
 * services (gen_ai.request.model). Keying on agent.name alone missed the proxy
 * / model services (e.g. bos-proxy-core), which are exactly the ones that carry
 * monitored caller edges in Smartscape — so the upstream table came back empty
 * even though real callers existed. The union is the correct "AI services" set.
 */
export const buildAiServiceIdsQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.agent.name) or isNotNull(gen_ai.request.model)
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
  // NB: smartscapeEdges target_id is a *smartscape-id* type, not a string —
  // `in(target_id, array("SERVICE-…"))` silently never matches (0 rows), which
  // left the upstream-caller list empty. Coerce with toString() so the id-vs-
  // string comparison holds.
  return `
smartscapeEdges type:"calls"
| filter in(toString(target_id), array(${dqlIdArray(aiServiceIds)}))
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

/**
 * Most-recent trace id that carries this agent's name — used to seed the
 * Agents-tab trace-level topology (reuses the Prompts TraceTopology renderer).
 * `trace.id` is a uid column, so we surface it as a hex string via toString();
 * start_ms (epoch ms) lets the trace-spans fetch bracket a tight time window.
 */
export const buildAgentLatestTraceQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  agentName: string,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
| filter gen_ai.agent.name == "${dqlEscape(agentName)}"
| summarize ts = max(start_time), by: { trace.id }
| sort ts desc
| limit 1
| fieldsAdd trace_id = toString(trace.id), start_ms = toLong(ts) / 1000000
| fields trace_id, start_ms
`.trim();

/**
 * Candidate traces for ONE agent+tool — the pool the "Representative traces"
 * list (Agents-tab tool drilldown) selects an interesting <=10 subset from.
 *
 * Scoping mirrors buildAgentToolDetailQuery EXACTLY so the candidate population
 * matches the tool row's call counts: filter to the agent's tool spans (strict
 * -> gen_ai.tool.name == toolName; discovered -> span.name == toolName with the
 * same internal/client + non-LLM + non-MCP-lifecycle exclusions), then collapse
 * to one row per trace.
 *
 * Per trace we surface: dur_ms (the slowest tool-span duration in the trace),
 * is_error (any errored tool span -> the trace is interesting), start_ms (epoch
 * ms, for recency + the trace-spans window) and calls. trace.id is a uid column
 * so it's stringified via toString(). Tool spans carry no tokens/model, so
 * selection downstream is latency/error/recency-driven only.
 */
export const buildAgentToolTracesQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  agentName: string,
  toolName: string,
  strict: boolean,
): string => {
  const toolKey = strict ? "gen_ai.tool.name" : "span.name";
  const modeFilter = strict
    ? `| filter isNotNull(gen_ai.tool.name)`
    : `| filter span.kind == "internal" or span.kind == "client"
| filter isNull(gen_ai.provider.name) and isNull(gen_ai.request.model)
| filter ${mcpNotLifecycleClause()}`;
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.agent.name)
| filter gen_ai.agent.name == "${dqlEscape(agentName)}"
${modeFilter}
| filter ${toolKey} == "${dqlEscape(toolName)}"
| dedup {span.id}
| fieldsAdd is_err_span = if(isNotNull(exception.type) or span.status_code == "error", 1, else: 0)
| summarize
    dur_ms = max(duration) / 1000000,
    is_error = if(countIf(is_err_span > 0) > 0, true, else: false),
    start_ms = toLong(min(start_time)) / 1000000,
    calls = count(),
    by: { trace.id }
| fieldsAdd trace_id = toString(trace.id)
| fields trace_id, start_ms, dur_ms, is_error, calls
| sort start_ms desc
| limit 200
`.trim();
};

/** Per-agent invocations timeseries for the hero chart. */
export const buildInvocationsSeriesQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  intervalSec: number,
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.agent.name)
// One invocation = one trace, not one span (see buildAgentsQuery). countDistinct keeps
// the hero chart consistent with the table's INV column.
| makeTimeseries invocations = countDistinct(trace.id), interval: ${intervalSec}s
`.trim();

/**
 * Rolling 7d P90 baseline per agent for the DegradedTrendPanel. This is the
 * REAL baseline (a separate 7-day window) the panel compares the current-scope
 * P90 against — replacing the old "first half of the 24h trend" placeholder
 * that made every agent read "+0% vs baseline". Honors the toolbar scan limit
 * via injection; scoped to the top slow agents only so the 7d scan stays small.
 */
export const buildAgentBaselineQuery = (
  serviceIds: string[] | null,
  topAgents: string[],
): string => {
  if (topAgents.length === 0) {
    return `
fetch spans, samplingRatio: 1, from: now()-7d
| filter false
| summarize baseline_ns = percentile(duration, 90)
`.trim();
  }
  const agentArray = topAgents.map((n) => `"${dqlEscape(n)}"`).join(", ");
  // Global filters are injected centrally by useScopedDql.
  return `
fetch spans, samplingRatio: 1, from: now()-7d, to: now()
${scopeFilterClause(serviceIds)}
| filter in(gen_ai.agent.name, array(${agentArray}))
| dedup {span.id}
| summarize baseline_ns = percentile(duration, 90), by: { agent = gen_ai.agent.name }
`.trim();
};

/**
 * LangGraph node-execution volume over the scope timeframe — the raw signal
 * loop detection is built on. Surfaced as a time series in the Looping Agents
 * tile popup (honest: it's the real per-bucket node-execution count, not a
 * reconstructed loop-rate series). A rising line = more graph activity / deeper
 * iteration.
 */
export const buildAgentLoopsSeriesQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  intervalSec: number,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
| filter isNotNull(traceloop.association.properties.langgraph_node)
| makeTimeseries node_execs = count(), interval: ${intervalSec}s
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
fetch spans, samplingRatio: 1, from: now()-24h
| filter false
| summarize n = count()
`.trim();
  }
  const agentArray = topAgents
    .map((n) => `"${dqlEscape(n)}"`)
    .join(", ");
  return `
fetch spans, samplingRatio: 1, from: now()-24h, to: now()
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter in(gen_ai.agent.name, array(${agentArray}))
| makeTimeseries
    p90_ns = percentile(duration, 90),
    interval: 1h,
    by: { agent = gen_ai.agent.name }
`.trim();
};

/**
 * Max single-tool call count per agent — input to the "high tool frequency"
 * (N+1) badge. Uses the Discovered tool definition (internal/client function
 * spans by name), matching the Agents-tab default, so it works on fleets that
 * don't emit gen_ai.tool.name.
 */
export const buildHighFrequencyToolsQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.agent.name)
| filter span.kind == "internal" or span.kind == "client"
| filter isNull(gen_ai.provider.name) and isNull(gen_ai.request.model)
| filter span.name != gen_ai.agent.name
| summarize calls = count(), by: { agent = gen_ai.agent.name, tool = span.name }
| summarize maxToolCalls = max(calls), by: { agent }
`.trim();
