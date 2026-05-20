/**
 * DQL string builders for scope resolution. Mirrors SPEC.md §5 and the CMDB
 * cascade convention from the Quality Engineering Performance Testing dashboard.
 *
 * NOTE: Queries should be validated against the United Airlines nonprod tenant
 * (`dtctl query run --tenant ualpre --dql ...`) before being relied upon.
 */

/** Escape a value for safe interpolation inside a DQL double-quoted string. */
export const dqlEscape = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** Format a list of entity ids as a DQL array literal: `"id1", "id2", ...` */
export const dqlIdArray = (ids: string[]): string =>
  ids.map((id) => `"${dqlEscape(id)}"`).join(", ");

/**
 * Emit a service-id filter clause when an AppCI scope is active. When
 * `serviceIds` is `null` the app is running fleet-wide and no filter is added.
 * Hooks must guard so this is never called with `[]` — that path would scan
 * everything despite the user expecting "nothing in scope".
 */
export const scopeFilterClause = (serviceIds: string[] | null): string =>
  serviceIds === null
    ? ""
    : `| filter in(dt.entity.service, array(${dqlIdArray(serviceIds)}))`;

/** CMDB AppCI <-> owner mapping lookup table path. */
export const CMDB_LOOKUP_PATH = "/lookups/dynatrace/cmdb_appci_owner_mapping";

export const APPCI_OPTIONS_QUERY = `
load "${CMDB_LOOKUP_PATH}"
| filter operational_status != "Retired"
| sort applicationci asc
| fields applicationci
| dedup applicationci
| limit 10000
`.trim();

export const buildApplicationOptionsQuery = (appCi: string): string => `
load "${CMDB_LOOKUP_PATH}"
| filter operational_status != "Retired"
| filter matchesValue(applicationci, "${dqlEscape(appCi)}")
| fieldsAdd label = concat(upper(applicationci), " - ", name)
| sort applicationci asc
| fields label
`.trim();

export const buildResolvedServicesQuery = (
  appCi: string,
  env: string | undefined,
): string => {
  const envClause = env
    ? `| filter matchesValue(tagstr, "*env:${dqlEscape(env)}*")`
    : "";
  return `
fetch dt.entity.service
| fieldsAdd tagstr = toString(tags)
| filter matchesValue(tagstr, "*applicationci:${dqlEscape(appCi)}*")
${envClause}
| fields id, entity.name
| dedup id
| sort entity.name asc
| limit 10000
`.trim();
};

/**
 * Cheap aggregation: count of distinct agent names. Filtered by the resolved
 * service list when an AppCI is active, otherwise runs fleet-wide. The
 * attribute path will graduate into detection/attributes.ts in a later session.
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

/** Cheap distinct-services count used by the status line in fleet-wide mode. */
export const FLEET_SERVICE_COUNT_QUERY = `
fetch spans, samplingRatio: 1, from: now()-24h, scanLimitGBytes: 200
| filter isNotNull(gen_ai.provider.name)
| summarize services = countDistinct(dt.entity.service)
`.trim();
