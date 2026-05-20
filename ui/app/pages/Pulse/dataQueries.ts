import { scopeFilterClause } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/**
 * One row of aggregate signals used by the 9-tile summary row.
 * Tokens (current + spark series), p95 latency, error rate, distinct counts.
 */
export const buildSummaryQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, from: ${timeframe.from}, to: ${to(timeframe)}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name)
| fieldsAdd
    in_tok = coalesce(toLong(gen_ai.usage.input_tokens), 0),
    out_tok = coalesce(toLong(gen_ai.usage.output_tokens), 0),
    is_error = if(isNotNull(exception.type), 1, else: 0)
| summarize
    requests = count(),
    input_tokens = sum(in_tok),
    output_tokens = sum(out_tok),
    p95_ns = percentile(duration, 95),
    errors = sum(is_error),
    models = countDistinct(gen_ai.request.model),
    mcp_servers = countDistinct(mcp.server.name),
    mcp_tools = countDistinct(gen_ai.tool.name)
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
fetch spans, from: ${timeframe.from}, to: ${to(timeframe)}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.agent.name)
| filter isNotNull(gen_ai.usage.input_tokens) or isNotNull(gen_ai.usage.output_tokens)
| fieldsAdd
    in_tok = coalesce(toLong(gen_ai.usage.input_tokens), 0),
    out_tok = coalesce(toLong(gen_ai.usage.output_tokens), 0),
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
fetch spans, from: ${timeframe.from}, to: ${to(timeframe)}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name)
| makeTimeseries
    tokens = sum(toLong(gen_ai.usage.input_tokens) + toLong(gen_ai.usage.output_tokens)),
    interval: ${intervalSec}s
`.trim();

/**
 * 24h activity histogram bucketed by hour, used as a quick visual of when
 * traffic peaks happen.
 */
export const buildActivityHistogramQuery = (
  serviceIds: string[] | null,
): string => `
fetch spans, from: now()-24h, to: now(), scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name)
| makeTimeseries requests = count(), interval: 1h
`.trim();

/**
 * Provider share of requests. Pre-normalization happens in detection layer
 * (Session 6) — for v1 the raw gen_ai.provider.name value is used.
 */
export const buildProviderMixQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, from: ${timeframe.from}, to: ${to(timeframe)}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name)
| summarize
    requests = count(),
    tokens = sum(toLong(gen_ai.usage.input_tokens) + toLong(gen_ai.usage.output_tokens)),
    by: { provider = gen_ai.provider.name }
| sort requests desc
| limit 12
`.trim();
