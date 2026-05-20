import { scopeFilterClause } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/**
 * AI services catalog: per-service aggregates used by the AIServicesTable and
 * the summary tiles. Includes a coarse logical-error count built from the
 * three signals called out in the handoff:
 *   - gen_ai.error.type attribute present
 *   - guardrail/moderation activation events
 *   - log-pattern matches happen client-side; here we approximate with
 *     gen_ai.response.refusal_reason which is the OTel-flavored marker.
 */
export const buildAIServicesQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, from: ${timeframe.from}, to: ${to(timeframe)}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name)
| fieldsAdd
    is_error = if(isNotNull(exception.type), 1, else: 0),
    has_gen_ai_error = if(isNotNull(gen_ai.error.type), 1, else: 0),
    has_guardrail = if(isNotNull(gen_ai.guardrail.action) or isNotNull(gen_ai.moderation.action), 1, else: 0),
    has_refusal = if(isNotNull(gen_ai.response.refusal_reason), 1, else: 0),
    in_tok = coalesce(toLong(gen_ai.usage.input_tokens), 0),
    out_tok = coalesce(toLong(gen_ai.usage.output_tokens), 0)
| summarize
    requests = count(),
    tokens = sum(in_tok + out_tok),
    errors = sum(is_error),
    logical_errors = sum(has_gen_ai_error + has_guardrail + has_refusal),
    agents = countDistinct(gen_ai.agent.name),
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
): string => `
fetch spans, from: ${timeframe.from}, to: ${to(timeframe)}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.request.model)
| fieldsAdd
    in_tok = coalesce(toLong(gen_ai.usage.input_tokens), 0),
    out_tok = coalesce(toLong(gen_ai.usage.output_tokens), 0)
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
