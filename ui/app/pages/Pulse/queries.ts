import { dqlTimeArg, scopeFilterClause } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";

const tfTo = (tf: Timeframe): string => tf.to ?? "now()";

/**
 * Health drilldown — top contributing agents by P95 latency and error count,
 * so the Platform Health card can explain *which* agents drive a degraded
 * operational score.
 */
export const buildSlowAgentsQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(tfTo(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.agent.name)
| dedup {span.id}
| fieldsAdd is_error = if(isNotNull(exception.type) or toLong(coalesce(http.response.status_code, 0)) >= 400, 1, else: 0)
| summarize
    p95_ms = percentile(duration, 95) / 1000000,
    calls = count(),
    errors = sum(is_error),
    by: { name = gen_ai.agent.name }
| fieldsAdd error_rate_pct = if(calls > 0, toDouble(errors) / toDouble(calls) * 100, else: 0)
| sort p95_ms desc
| limit 5
`.trim();

/** Health drilldown — slowest models by P95 (the inference tier contributors). */
export const buildSlowModelsQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(tfTo(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.request.model)
| dedup {span.id}
| summarize
    p95_ms = percentile(duration, 95) / 1000000,
    calls = count(),
    by: { name = gen_ai.request.model }
| sort p95_ms desc
| limit 5
`.trim();

/**
 * Operational signals: p95 latency, error rate, total span count for the resolved
 * services in the current scope timeframe. The detection layer (Session 4) will
 * own the canonical AI-span filter; for now we look for any span carrying a
 * `gen_ai.*` attribute as a coarse proxy.
 */
export const buildOperationalQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(timeframe.to ?? "now()")}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name) or isNotNull(gen_ai.agent.name) or isNotNull(gen_ai.tool.name)
| dedup {span.id}
| fieldsAdd is_error = if(isNotNull(exception.type) or toLong(coalesce(http.response.status_code, 0)) >= 400, 1, else: 0)
| summarize
    total = count(),
    errors = sum(is_error),
    p95_ms = percentile(duration, 95) / 1000000,
    p50_ms = percentile(duration, 50) / 1000000
`.trim();

/**
 * Quality signals: count of LLM spans that carry any gen_ai.evaluation.* attribute.
 * Used to detect whether an eval pipeline has been wired up at all.
 */
export const buildQualityPresenceQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(timeframe.to ?? "now()")}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name)
| dedup {span.id}
| fieldsAdd has_eval = if(
    isNotNull(gen_ai.evaluation.score)
      or isNotNull(gen_ai.evaluation.hallucination)
      or isNotNull(gen_ai.evaluation.correctness)
      or isNotNull(gen_ai.evaluation.relevance),
    1, else: 0)
| summarize
    total = count(),
    with_eval = sum(has_eval),
    avg_score = avg(toDouble(gen_ai.evaluation.score))
`.trim();

/**
 * Cost signals: total tokens in the current scope timeframe and a baseline
 * sum across the rolling 7 days. Pricing conversion lives in data/pricing.ts
 * (added in a later session); for now we score variance on token count.
 */
export const buildCostQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(timeframe.to ?? "now()")}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name)
| dedup {span.id}
| summarize
    requests = count(),
    input_tokens = sum(toLong(gen_ai.usage.input_tokens)),
    output_tokens = sum(toLong(gen_ai.usage.output_tokens)),
    distinct_models = countDistinct(gen_ai.request.model)
`.trim();

export const buildCostBaselineQuery = (
  serviceIds: string[] | null,
): string => `
fetch spans, samplingRatio: 1, from: now()-7d, to: now(), scanLimitGBytes: 1000
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name)
| dedup {span.id}
| summarize
    requests_7d = count(),
    input_tokens_7d = sum(toLong(gen_ai.usage.input_tokens)),
    output_tokens_7d = sum(toLong(gen_ai.usage.output_tokens))
`.trim();
