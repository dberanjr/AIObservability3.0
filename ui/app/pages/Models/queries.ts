import { dqlTimeArg, scopeFilterClause, globalFilterClauses, type GlobalFilters } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/**
 * Per-model aggregates. Capped at 200 rows (more than enough for any
 * realistic AppCI). Timeout rate reads span.status_code which is the OTel
 * convention — when the tenant doesn't set it the field comes back null and
 * the UI shows "—".
 */
export const buildModelsQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.request.model)
| fieldsAdd
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0)),
    is_error = if(isNotNull(exception.type) or toLong(coalesce(http.response.status_code, 0)) >= 400, 1, else: 0),
    is_timeout = if(span.status_code == "TIMEOUT", 1, else: 0),
    has_timeout_attr = if(isNotNull(span.status_code), 1, else: 0),
    op_name = gen_ai.operation.name
| summarize
    requests = count(),
    input_tokens = sum(in_tok),
    output_tokens = sum(out_tok),
    avg_input_tokens = avg(in_tok),
    avg_output_tokens = avg(out_tok),
    avg_ms = avg(duration) / 1000000,
    p95_ms = percentile(duration, 95) / 1000000,
    p99_ms = percentile(duration, 99) / 1000000,
    errors = sum(is_error),
    timeouts = sum(is_timeout),
    has_status_code = sum(has_timeout_attr),
    operation = takeFirst(op_name),
    system = takeFirst(gen_ai.provider.name),
    by: { model = gen_ai.request.model }
| fieldsAdd
    error_rate_pct = if(requests > 0, toDouble(errors) / toDouble(requests) * 100, else: 0),
    timeout_rate_pct = if(requests > 0, toDouble(timeouts) / toDouble(requests) * 100, else: 0)
| sort requests desc
| limit 200
`.trim();
