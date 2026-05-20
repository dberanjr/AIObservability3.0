import { dqlEscape, scopeFilterClause } from "../../scope/queries";
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
): string => `
fetch spans, from: ${timeframe.from}, to: ${to(timeframe)}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.agent.name)
| fieldsAdd
    in_tok = coalesce(toLong(gen_ai.usage.input_tokens), 0),
    out_tok = coalesce(toLong(gen_ai.usage.output_tokens), 0),
    is_error = if(isNotNull(exception.type), 1, else: 0),
    has_llm = if(isNotNull(gen_ai.provider.name), 1, else: 0),
    has_tool = if(isNotNull(gen_ai.tool.name), 1, else: 0),
    ttft_ms = if(isNotNull(gen_ai.usage.time_to_first_token), toDouble(gen_ai.usage.time_to_first_token), else: null)
| summarize
    invocations = count(),
    p50_ns = percentile(duration, 50),
    p90_ns = percentile(duration, 90),
    p99_ns = percentile(duration, 99),
    avg_ns = avg(duration),
    errors = sum(is_error),
    input_tokens = sum(in_tok),
    output_tokens = sum(out_tok),
    llm_count = sum(has_llm),
    tool_count = sum(has_tool),
    avg_ttft_ms = avg(ttft_ms),
    models = collectDistinct(gen_ai.request.model),
    framework = takeFirst(gen_ai.framework),
    by: {
      agent = gen_ai.agent.name,
      service = entityName(dt.entity.service),
      service_id = dt.entity.service
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

/** Quality eval coverage and aggregate scores. */
export const buildAgentEvalQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, from: ${timeframe.from}, to: ${to(timeframe)}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.agent.name)
| fieldsAdd
    has_correctness = if(isNotNull(gen_ai.evaluation.tool_correctness), 1, else: 0),
    has_halluc = if(isNotNull(gen_ai.evaluation.hallucination), 1, else: 0),
    has_success = if(isNotNull(gen_ai.evaluation.task_success), 1, else: 0),
    ctx_tokens = coalesce(toLong(gen_ai.usage.input_tokens), 0)
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

/** Upstream service callers — best-effort via parent.service.name attribute. */
export const buildUpstreamServicesQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, from: ${timeframe.from}, to: ${to(timeframe)}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.agent.name)
| filter isNotNull(parent.service.name)
| summarize
    calls = count(),
    agents = countDistinct(gen_ai.agent.name),
    by: { upstream = parent.service.name }
| sort calls desc
| limit 20
`.trim();

/** Per-agent invocations timeseries for the hero chart. */
export const buildInvocationsSeriesQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  intervalSec: number,
): string => `
fetch spans, from: ${timeframe.from}, to: ${to(timeframe)}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
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
): string => {
  if (topAgents.length === 0) {
    return `
fetch spans, from: now()-24h, scanLimitGBytes: 100
| filter false
| summarize n = count()
`.trim();
  }
  const agentArray = topAgents
    .map((n) => `"${dqlEscape(n)}"`)
    .join(", ");
  return `
fetch spans, from: now()-24h, to: now(), scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter in(gen_ai.agent.name, array(${agentArray}))
| makeTimeseries
    p90_ns = percentile(duration, 90),
    interval: 1h,
    by: { agent = gen_ai.agent.name }
`.trim();
};
