/**
 * DQL string builders that participate in scope resolution.
 *
 * AppCI / Application / Env scoping was retired in favour of Dynatrace
 * platform Segments — those scope queries at the request level via
 * `filterSegments` on DqlQueryParams. As a result `scopeFilterClause`
 * always receives `null` from the (now-stubbed) `useResolvedServices`
 * hook and emits the empty string. The function is kept so existing
 * page query builders continue to compile and stay forward-compatible
 * if per-service filtering is reintroduced later.
 */

/** Escape a value for safe interpolation inside a DQL double-quoted string. */
export const dqlEscape = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** Format a list of entity ids as a DQL array literal: `"id1", "id2", ...` */
export const dqlIdArray = (ids: string[]): string =>
  ids.map((id) => `"${dqlEscape(id)}"`).join(", ");

/**
 * Emit a service-id filter clause when a resolved service list is provided.
 * `null` (the only value passed today) yields an empty clause so the query
 * runs fleet-wide. The signature preserves the option of reintroducing
 * service-id filtering later.
 */
export const scopeFilterClause = (serviceIds: string[] | null): string =>
  serviceIds === null
    ? ""
    : `| filter in(dt.entity.service, array(${dqlIdArray(serviceIds)}))`;

/**
 * Cheap distinct-agent count for the fleet-wide status line. `serviceIds`
 * is accepted for signature compatibility but always passes through as null.
 */
export const buildAgentCountQuery = (
  serviceIds: string[] | null,
  timeframe: { from: string; to?: string },
): string => {
  const toClause = timeframe.to ?? "now()";
  return `
fetch spans, samplingRatio: 1, from: ${timeframe.from}, to: ${toClause}, scanLimitGBytes: 200
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.agent.name)
| summarize agents = countDistinct(gen_ai.agent.name)
`.trim();
};

export const buildToolCountQuery = (
  serviceIds: string[] | null,
  timeframe: { from: string; to?: string },
): string => {
  const toClause = timeframe.to ?? "now()";
  return `
fetch spans, samplingRatio: 1, from: ${timeframe.from}, to: ${toClause}, scanLimitGBytes: 200
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.tool.name)
| summarize tools = countDistinct(gen_ai.tool.name)
`.trim();
};

/** Distinct-services count for the status line. */
export const FLEET_SERVICE_COUNT_QUERY = `
fetch spans, samplingRatio: 1, from: now()-24h, scanLimitGBytes: 200
| filter isNotNull(gen_ai.provider.name)
| summarize services = countDistinct(dt.entity.service)
`.trim();
