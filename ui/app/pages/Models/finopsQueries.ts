import { dqlTimeArg, scopeFilterClause, globalFilterClauses, type GlobalFilters } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/**
 * 7-day daily-by-model token totals for the stacked cost bar. Cost math
 * (tokens × pricing) happens client-side so we can stay in DQL with sums.
 */
export const buildDailyTokensQuery = (
  serviceIds: string[] | null,
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: now()-7d, to: now()
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.request.model)
| fieldsAdd
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0))
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
  filters?: GlobalFilters,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.request.model)
| fieldsAdd
    in_tok = toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)),
    out_tok = toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0))
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
