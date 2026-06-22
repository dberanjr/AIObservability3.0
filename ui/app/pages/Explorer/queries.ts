import { dqlTimeArg, dqlEscape, scopeFilterClause, globalFilterClauses, logicalErrorField, LOGICAL_ERROR_EXPR, type GlobalFilters } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/**
 * AI services catalog: per-service aggregates used by the AIServicesTable and
 * the summary tiles.
 *
 * Logical errors = HTTP-200 responses that nonetheless failed at the payload
 * level. In this tenant the OTel-flavored markers (gen_ai.error.type,
 * guardrail/moderation, refusal_reason) have zero data, so the load-bearing
 * signal is gen_ai.response.finish_reasons containing "max_tokens" (truncated
 * output), "content_filter", or "refusal". We keep the OTel markers too so the
 * query stays correct for tenants that DO emit them.
 */
export const buildAIServicesQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.provider.name)
| dedup {span.id}
| fieldsAdd
    ${logicalErrorField()},
    has_gen_ai_error = if(isNotNull(gen_ai.error.type), 1, else: 0),
    has_guardrail = if(isNotNull(gen_ai.guardrail.action) or isNotNull(gen_ai.moderation.action), 1, else: 0),
    has_refusal = if(isNotNull(gen_ai.response.refusal_reason) or contains(toString(gen_ai.response.finish_reasons), "refusal"), 1, else: 0),
    has_truncation = if(contains(toString(gen_ai.response.finish_reasons), "max_tokens"), 1, else: 0),
    has_content_filter = if(contains(toString(gen_ai.response.finish_reasons), "content_filter"), 1, else: 0),
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0))
| summarize
    requests = count(),
    tokens = sum(in_tok + out_tok),
    errors = sum(is_error),
    logical_errors = sum(has_gen_ai_error + has_guardrail + has_refusal + has_truncation + has_content_filter),
    agents = countDistinct(gen_ai.agent.name),
    agent_names = collectDistinct(gen_ai.agent.name),
    models = collectDistinct(gen_ai.request.model),
    framework = takeFirst(gen_ai.framework),
    by: { service = entityName(dt.entity.service), service_id = dt.entity.service }
| fieldsAdd
    tok_per_req = if(requests > 0, toDouble(tokens) / toDouble(requests), else: 0),
    error_rate_pct = if(requests > 0, toDouble(errors) / toDouble(requests) * 100, else: 0)
| sort tokens desc
| limit 200
`.trim();

/**
 * Service × model heatmap data. Rows = service, cols = model, cell = tokens.
 */
export const buildServiceModelHeatmapQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.request.model)
| dedup {span.id}
| fieldsAdd
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0))
| summarize
    requests = count(),
    tokens = sum(in_tok + out_tok),
    by: {
      service = entityName(dt.entity.service),
      service_id = dt.entity.service,
      model = gen_ai.request.model,
      system = gen_ai.provider.name
    }
| sort tokens desc
| limit 1000
`.trim();

/**
 * OTel-flavoured logical-error markers, mirroring the `has_*` fields summed in
 * buildAIServicesQuery (gen_ai.error.type, guardrail/moderation, refusal,
 * truncation, content_filter). Folded into a single boolean for `countIf` so
 * the detail query reports the same logical-error population the services
 * catalog does. These markers are often zero on this tenant; finish_reasons
 * does the load-bearing work.
 */
const OTEL_LOGICAL_ERROR_EXPR = `(
    isNotNull(gen_ai.error.type)
    or isNotNull(gen_ai.guardrail.action)
    or isNotNull(gen_ai.moderation.action)
    or isNotNull(gen_ai.response.refusal_reason)
    or contains(toString(gen_ai.response.finish_reasons), "refusal")
    or contains(toString(gen_ai.response.finish_reasons), "max_tokens")
    or contains(toString(gen_ai.response.finish_reasons), "content_filter")
  )`;

/**
 * Golden-signal + token metrics for ONE service×model pair, powering the
 * heatmap-cell detail modal. The pair is identified by the SAME fields the
 * heatmap groups by — `entityName(dt.entity.service)` and
 * `gen_ai.request.model` — so the cell the user clicked maps to exactly this
 * row. Values are escaped via dqlEscape. `errors` counts the load-bearing
 * logical-error rule (shared with buildAIServicesQuery's `is_error`);
 * `logical_errors` counts the OTel-marker population.
 */
export const buildServiceModelDetailQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  service: string,
  model: string,
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.request.model)
| filter gen_ai.request.model == "${dqlEscape(model)}"
| filter entityName(dt.entity.service) == "${dqlEscape(service)}"
| dedup {span.id}
| fieldsAdd
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0))
| summarize
    requests = count(),
    in_tok = sum(in_tok),
    out_tok = sum(out_tok),
    errors = countIf(${LOGICAL_ERROR_EXPR}),
    logical_errors = countIf(${OTEL_LOGICAL_ERROR_EXPR}),
    p50_ns = percentile(duration, 50),
    p90_ns = percentile(duration, 90),
    p95_ns = percentile(duration, 95)
`.trim();
