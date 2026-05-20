import { scopeFilterClause } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/**
 * 7-day daily-by-model token totals for the stacked cost bar. Cost math
 * (tokens × pricing) happens client-side so we can stay in DQL with sums.
 */
export const buildDailyTokensQuery = (
  serviceIds: string[] | null,
): string => `
fetch spans, from: now()-7d, to: now(), scanLimitGBytes: 1000
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.request.model)
| fieldsAdd
    in_tok = coalesce(toLong(gen_ai.usage.input_tokens), 0),
    out_tok = coalesce(toLong(gen_ai.usage.output_tokens), 0)
| makeTimeseries
    input_tokens = sum(in_tok),
    output_tokens = sum(out_tok),
    interval: 1d,
    by: { model = gen_ai.request.model }
`.trim();

/**
 * Per-service per-model token totals over the current scope timeframe. Drives
 * the treemap and the per-service efficiency bar list.
 */
export const buildServiceCostBreakdownQuery = (
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
    input_tokens = sum(in_tok),
    output_tokens = sum(out_tok),
    by: {
      service = entityName(dt.entity.service),
      model = gen_ai.request.model
    }
| sort (input_tokens + output_tokens) desc
| limit 500
`.trim();
