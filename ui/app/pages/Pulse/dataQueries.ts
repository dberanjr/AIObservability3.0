import { dqlTimeArg, scopeFilterClause } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";
import { dqlNormalizedProvider, dqlViaBedrock } from "../../detection/dql";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/**
 * Per-model token-efficiency inputs. Cost is computed in JS from per-model
 * pricing, so this returns the raw aggregates: input/output tokens, request
 * count, truncations (finish_reasons contains "max_tokens" = wasted/incomplete
 * generation), and summed duration (for throughput). Grouped by model so the
 * hook can price each correctly before aggregating.
 */
export const buildTokenEfficiencyQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.request.model)
| dedup {span.id}
| fieldsAdd
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0)),
    trunc = if(contains(toString(gen_ai.response.finish_reasons), "max_tokens"), 1, else: 0),
    has_eval = if(isNotNull(gen_ai.evaluation.hallucination) or isNotNull(gen_ai.evaluation.correctness) or isNotNull(gen_ai.evaluation.faithfulness) or isNotNull(gen_ai.evaluation.relevance) or isNotNull(gen_ai.evaluation.score), 1, else: 0)
| summarize
    input_tokens = sum(in_tok),
    output_tokens = sum(out_tok),
    requests = count(),
    truncations = sum(trunc),
    eval_spans = sum(has_eval),
    dur_s = sum(duration) / 1000000000,
    by: { model = gen_ai.request.model }
`.trim();

/**
 * One row of aggregate signals used by the 9-tile summary row.
 * Tokens (current + spark series), p95 latency, error rate, distinct counts.
 *
 * MCP servers/tools are derived from `traceloop.workflow.name` matching
 * `*.mcp` (the v2 app's proven formula) — canonical OTel `mcp.*`
 * attributes aren't emitted by the SDKs in this tenant.
 */
export const buildSummaryQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name)
| dedup {span.id}
| fieldsAdd
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0)),
    is_error = if(isNotNull(exception.type) or toLong(coalesce(http.response.status_code, 0)) >= 400, 1, else: 0),
    mcp_server = if(matchesValue(traceloop.workflow.name, "*.mcp"), traceloop.workflow.name),
    mcp_tool   = if(matchesValue(traceloop.workflow.name, "*.mcp"), coalesce(gen_ai.tool.name, traceloop.entity.name))
| summarize
    requests = count(),
    input_tokens = sum(in_tok),
    output_tokens = sum(out_tok),
    p95_ns = percentile(duration, 95),
    errors = sum(is_error),
    models = countDistinct(gen_ai.request.model),
    mcp_servers = countDistinct(mcp_server),
    mcp_tools = countDistinct(mcp_tool)
| fieldsAdd
    total_tokens = input_tokens + output_tokens,
    p95_ms = p95_ns / 1000000,
    error_rate_pct = if(requests > 0, toDouble(errors) / toDouble(requests) * 100, else: 0),
    token_efficiency_pct = if((input_tokens + output_tokens) > 0,
      toDouble(output_tokens) / toDouble(input_tokens + output_tokens) * 100,
      else: 0)
`.trim();

/**
 * Per-agent token usage and request counts. Per-model pricing is applied
 * client-side (see useAgentCosts). Attribution: any span carrying both an
 * agent name and usage counts on the same trace counts toward that agent.
 */
export const buildAgentCostQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.agent.name)
| filter isNotNull(gen_ai.usage.input_tokens) or isNotNull(gen_ai.usage.output_tokens)
| fieldsAdd
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0)),
    model = coalesce(gen_ai.request.model, "unknown")
| summarize
    invocations = count(),
    input_tokens = sum(in_tok),
    output_tokens = sum(out_tok),
    by: { agent = gen_ai.agent.name, model }
| sort (input_tokens + output_tokens) desc
| limit 50
`.trim();

/**
 * Bucketed time series of total token consumption. The chart pairs this with
 * a client-side cost line derived from the blended per-request cost.
 */
export const buildTokenSeriesQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  intervalSec: number,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name)
| dedup {span.id}
| makeTimeseries
    tokens = sum(toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)) + toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0))),
    interval: ${intervalSec}s
`.trim();

/**
 * Counts of distinct MCP servers + tools, run as its own query because
 * MCP workflow spans don't carry `gen_ai.provider.name` — the main
 * summary query filters those out, which is why the donut centers used
 * to show 0 even though the breakdown queries (no GenAI filter) had
 * data. Splitting the count query keeps the summary lean and avoids a
 * brittle conditional-aggregate rewrite.
 */
export const buildMcpCountQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter matchesValue(traceloop.workflow.name, "*.mcp")
| fieldsAdd tool = coalesce(gen_ai.tool.name, traceloop.entity.name)
| summarize
    mcp_servers = countDistinct(traceloop.workflow.name),
    mcp_tools   = countDistinct(tool)
`.trim();

/**
 * Multi-series timeseries used to feed the four summary-tile sparklines
 * (Tokens / Spend / P95 latency / Error rate). Returns four parallel
 * arrays, one bucket per element, all keyed to the same `interval`. The
 * Spend spark is derived client-side from `tokens` so we don't have to
 * pull pricing into DQL.
 */
export const buildSummarySparkSeriesQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  intervalSec: number,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name)
| dedup {span.id}
| fieldsAdd
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0)),
    is_error = if(isNotNull(exception.type) or toLong(coalesce(http.response.status_code, 0)) >= 400, 1, else: 0)
| makeTimeseries
    tokens = sum(in_tok + out_tok),
    p95_ns = percentile(duration, 95),
    errors = sum(is_error),
    requests = count(),
    interval: ${intervalSec}s
`.trim();

/**
 * 24h activity histogram bucketed by hour, used as a quick visual of when
 * traffic peaks happen.
 */
export const buildActivityHistogramQuery = (
  serviceIds: string[] | null,
): string => `
fetch spans, samplingRatio: 1, from: now()-24h, to: now(), scanLimitGBytes: 5000
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name)
| dedup {span.id}
| makeTimeseries requests = count(), interval: 1h
`.trim();

/**
 * Per-model request counts for the Models tile donut. Stripped of the model
 * version suffix client-side so "claude-sonnet-4-5-20250114" and
 * "claude-sonnet-4-5" collapse to one slice. Also returns input/output
 * token sums so the maximized table can show tokens + derived cost per row.
 */
export const buildModelsBreakdownQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.request.model)
| dedup {span.id}
| fieldsAdd
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0))
| summarize
    requests = count(),
    input_tokens = sum(in_tok),
    output_tokens = sum(out_tok),
    by: { model = gen_ai.request.model }
| sort requests desc
| limit 12
`.trim();

/**
 * Per-MCP-server request counts for the MCP Servers tile donut. MCP
 * workflow spans. MCP server processes are standalone service traces
 * (span.parent_id=null, 0 LLM calls; verified via dtctl). Health signals are
 * duration (p50/p95/p99) and two error categories detectable from span data:
 * span_errors (span.status_code="error" → transport/OTel-level) and
 * tool_errors (isError present in mcp.response.value → functional failures).
 * Filters to traceloop.span.kind="server" for accurate invocation counts.
 */
export const buildMcpServersBreakdownQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter matchesValue(traceloop.workflow.name, "*.mcp")
| filter traceloop.span.kind == "server"
| fieldsAdd
    is_span_error = if(span.status_code == "error", 1, else: 0),
    is_tool_error = if(contains(toString(mcp.response.value), "isError"), 1, else: 0)
| summarize
    requests = count(),
    avg_ms = avg(duration) / 1000000,
    p50_ms = percentile(duration, 50) / 1000000,
    p95_ms = percentile(duration, 95) / 1000000,
    p99_ms = percentile(duration, 99) / 1000000,
    span_errors = sum(is_span_error),
    tool_errors = sum(is_tool_error),
    by: { server = traceloop.workflow.name }
| sort requests desc
| limit 100
`.trim();

/**
 * Per-MCP-tool health stats for the MCP Tools tile donut popup. Filters to
 * traceloop.span.kind="tool" for accurate per-invocation counts. Tool name
 * comes from traceloop.entity.name (always set on tool spans). Two error
 * categories: span_errors (span.status_code) + tool_errors (isError in
 * traceloop.entity.output). Verified via dtctl against ualpre.
 */
export const buildMcpToolsBreakdownQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter matchesValue(traceloop.workflow.name, "*.mcp")
| filter traceloop.span.kind == "tool"
| fieldsAdd
    is_span_error = if(span.status_code == "error", 1, else: 0),
    is_tool_error = if(contains(toString(traceloop.entity.output), "isError"), 1, else: 0)
| summarize
    calls = count(),
    avg_ms = avg(duration) / 1000000,
    p50_ms = percentile(duration, 50) / 1000000,
    p95_ms = percentile(duration, 95) / 1000000,
    p99_ms = percentile(duration, 99) / 1000000,
    span_errors = sum(is_span_error),
    tool_errors = sum(is_tool_error),
    by: { tool = traceloop.entity.name }
| sort calls desc
| limit 100
`.trim();

/**
 * Provider share of requests. Bedrock-proxied calls are unwrapped to their
 * upstream vendor (anthropic / cohere / mistral / etc.) server-side via
 * dqlNormalizedProvider so the donut buckets canonical providers rather than
 * raw `gen_ai.provider.name` variants like "aws_bedrock" vs "aws-bedrock".
 */
export const buildProviderMixQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name)
| dedup {span.id}
| fieldsAdd
    provider = ${dqlNormalizedProvider()},
    via_bedrock = if(${dqlViaBedrock()}, 1, else: 0)
| summarize
    requests = count(),
    tokens = sum(toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)) + toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0))),
    via_bedrock_count = sum(via_bedrock),
    raw_providers = collectDistinct(gen_ai.provider.name),
    by: { provider }
| sort requests desc
| limit 12
`.trim();
