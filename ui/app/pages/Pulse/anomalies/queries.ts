import { dqlTimeArg, scopeFilterClause } from "../../../scope/queries";
import type { Timeframe } from "../../../scope/types";
import { THRESHOLDS } from "./types";

const toClause = (tf: Timeframe): string => tf.to ?? "now()";

/**
 * Latency spike: per-service P95 over the scope timeframe. The fleet baseline
 * + ratio are computed client-side in useAnomalies, because DQL doesn't allow
 * a `fetch spans` subquery inside `fieldsAdd`. The hook takes the median of
 * the returned service P95s and flags rows where the per-service value
 * exceeds `latencySpikeRatio × baseline`.
 */
export const buildLatencySpikeQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(toClause(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name)
| summarize
    service_p95_ns = percentile(duration, 95),
    span_count = count(),
    by: { service = entityName(dt.entity.service), service_id = dt.entity.service }
| fieldsAdd service_p95_ms = service_p95_ns / 1000000
| filter span_count > 20
| sort service_p95_ms desc
| limit 50
| fields service, service_id, service_p95_ms, span_count
`.trim();

/**
 * Cost spike: bucketed hourly token totals over the scope; flag the most
 * recent bucket if it exceeds `costSpikeRatio × rolling 6h avg`. Uses tokens
 * as a cost proxy until pricing.ts is wired (Session 11).
 */
export const buildCostSpikeQuery = (serviceIds: string[] | null): string => `
fetch spans, samplingRatio: 1, from: now()-6h, to: now(), scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name)
| makeTimeseries
    tokens = sum(toLong(gen_ai.usage.input_tokens) + toLong(gen_ai.usage.output_tokens)),
    interval: 1h
| fieldsAdd current = arrayLast(tokens), avg = arrayAvg(tokens)
| fieldsAdd ratio = if(avg > 0, toDouble(current) / toDouble(avg), else: 0)
| filter ratio > ${THRESHOLDS.costSpikeRatio} and current > 1000
| fields current, avg, ratio
| limit 1
`.trim();

/**
 * Token surge: per-service hourly token totals; surface services whose latest
 * hour exceeds `tokenSurgeRatio × rolling avg`.
 */
export const buildTokenSurgeQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(toClause(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name)
| makeTimeseries
    tokens = sum(toLong(gen_ai.usage.input_tokens) + toLong(gen_ai.usage.output_tokens)),
    interval: 1h,
    by: { service = entityName(dt.entity.service), service_id = dt.entity.service }
| fieldsAdd current = arrayLast(tokens), avg = arrayAvg(tokens)
| fieldsAdd ratio = if(avg > 0, toDouble(current) / toDouble(avg), else: 0)
| filter ratio > ${THRESHOLDS.tokenSurgeRatio} and current > 1000
| sort ratio desc
| limit 10
| fields service, service_id, current, avg, ratio
`.trim();

/**
 * Runaway agent: per-agent P90 latency that exceeds the runaway threshold.
 */
export const buildRunawayAgentQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(toClause(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.agent.name)
| summarize
    p90_ns = percentile(duration, 90),
    invocations = count(),
    by: { agent = gen_ai.agent.name, service = entityName(dt.entity.service) }
| fieldsAdd p90_ms = p90_ns / 1000000
| filter p90_ms > ${THRESHOLDS.runawayAgentP90Ms} and invocations >= 3
| sort p90_ms desc
| limit 10
| fields agent, service, p90_ms, invocations
`.trim();
