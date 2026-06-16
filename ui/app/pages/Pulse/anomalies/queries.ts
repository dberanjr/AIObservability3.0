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
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(toClause(timeframe))}
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
fetch spans, samplingRatio: 1, from: now()-6h, to: now()
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name)
| makeTimeseries
    tokens = sum(toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)) + toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0))),
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
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(toClause(timeframe))}
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name)
| makeTimeseries
    tokens = sum(toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)) + toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0))),
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
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(toClause(timeframe))}
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

/**
 * I.1 — within-trace billable-token growth. Per trace, the time-ordered token
 * components of each LLM call (collectArray preserves the `sort timestamp`
 * order). The hook computes billableTokens per call via the cost model and runs
 * the pure growth detector, so a cached-prefix loop doesn't fire. Tag:
 * agent / orchestrator.
 */
export const buildWithinTraceGrowthQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(toClause(timeframe))}
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.request.model)
| sort timestamp asc
| summarize {
    ins = collectArray(toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0))),
    outs = collectArray(toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0))),
    cacheReads = collectArray(toLong(coalesce(gen_ai.usage.cached_tokens, gen_ai.usage.cache_read.input_tokens, 0))),
    cacheWrites = collectArray(toLong(coalesce(gen_ai.usage.cache_creation_input_tokens, 0))),
    agent = takeFirst(gen_ai.agent.name),
    n = count()
  }, by: { trace = trace.id }
| filter n >= 3
| sort n desc
| limit 200
`.trim();

/**
 * I.4 — model fallback / request-vs-response mismatch. Distinct request/response
 * model pairs with counts; the hook normalizes version suffixes before counting
 * a mismatch (so gpt-4o → gpt-4o-2024-.. is NOT a mismatch). Tag: llm.
 */
export const buildModelMismatchQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(toClause(timeframe))}
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.request.model) and isNotNull(gen_ai.response.model)
| summarize requests = count(), by: { req = gen_ai.request.model, resp = gen_ai.response.model }
| sort requests desc
| limit 200
`.trim();

/**
 * Max-token truncation / context-window exhaustion (brief H.2, kept separate
 * from the scope LOGICAL_ERROR_EXPR per the J-3 decision). Tag: llm.
 */
export const buildTruncationQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(toClause(timeframe))}
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.request.model)
| summarize {
    total = count(),
    truncated = countIf(contains(lower(toString(gen_ai.response.finish_reasons)), "max_tokens") or contains(lower(toString(gen_ai.response.finish_reasons)), "length"))
  }
| fieldsAdd ratio = if(total > 0, toDouble(truncated) / toDouble(total), else: 0)
| fields total, truncated, ratio
`.trim();

/**
 * I.3 — provider rate-limit / backoff. 429s (and rate-limit error codes) at the
 * LLM boundary. The backoff signature (growing inter-attempt gaps) is best seen
 * in traces; the fleet rate is the trigger. Tag: llm.
 */
export const buildRateLimitQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(toClause(timeframe))}
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.request.model)
| summarize {
    total = count(),
    rate_limited = countIf(toLong(coalesce(http.response.status_code, 0)) == 429 or contains(lower(toString(gen_ai.error.code)), "429") or contains(lower(toString(gen_ai.error.code)), "rate_limit") or contains(lower(toString(gen_ai.error.code)), "throttl"))
  }
| fieldsAdd ratio = if(total > 0, toDouble(rate_limited) / toDouble(total), else: 0)
| fields total, rate_limited, ratio
`.trim();

/**
 * I.5 — TTFT degradation. Hourly avg time-to-first-token; the hook flags the
 * latest bucket against the rolling average. Capability-gated on a TTFT
 * attribute in the hook (firstNonNull of the three spellings). Tag: llm.
 */
export const buildTtftDegradationQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(toClause(timeframe))}
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.usage.time_to_first_token) or isNotNull(gen_ai.response.ttft) or isNotNull(gen_ai.response.time_to_first_chunk)
| makeTimeseries
    ttft = avg(toDouble(coalesce(gen_ai.usage.time_to_first_token, gen_ai.response.ttft, gen_ai.response.time_to_first_chunk))),
    interval: 1h
| fieldsAdd current = arrayLast(ttft), avg = arrayAvg(ttft)
| fieldsAdd ratio = if(avg > 0, toDouble(current) / toDouble(avg), else: 0)
| fields current, avg, ratio
| limit 1
`.trim();
