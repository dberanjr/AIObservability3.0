import { dqlTimeArg, scopeFilterClause, globalFilterClauses, type GlobalFilters } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/**
 * Per-model token totals for ONE 24h day window (dayOffset 0 = the most recent
 * 24h, 1 = the day before, …). The stacked cost bar runs one of these per day
 * rather than a single 7-day `makeTimeseries` query: a 7-day `fetch spans` scans
 * multiple TB and truncates at the scan limit, leaving older days empty (the
 * "only 3 days show" bug). Splitting by day keeps each day's scan independent.
 * Scope is honored (unlike the global Pulse spend-glance) so the chart matches
 * the rest of the tab; the global filter is injected centrally by useScopedDql.
 * Cost math happens client-side from the token sums; the caller runs these at a
 * sampling floor and extrapolates.
 */
export const buildDailyTokensDayQuery = (
  serviceIds: string[] | null,
  dayOffset: number,
): string => {
  const from = dqlTimeArg(`now()-${(dayOffset + 1) * 24}h`);
  const to = dqlTimeArg(dayOffset === 0 ? "now()" : `now()-${dayOffset * 24}h`);
  return `
fetch spans, samplingRatio: 1, from: ${from}, to: ${to}
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.request.model)
| summarize
    input_tokens = sum(toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0))),
    output_tokens = sum(toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0))),
    by: { model = gen_ai.request.model }
`.trim();
};

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
    requests = count(),
    by: {
      service = entityName(dt.entity.service),
      model = gen_ai.request.model
    }
| sort (input_tokens + output_tokens) desc
| limit 500
`.trim();
