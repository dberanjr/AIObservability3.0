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

/**
 * Format a timeframe `from` / `to` value for safe interpolation into a DQL
 * `fetch` statement. Relative expressions (`now()-24h`, `@d`, `-30m`, etc.)
 * pass through unquoted; ISO 8601 timestamps (which the brush-zoom emits)
 * are wrapped in double quotes so the parser doesn't read `2026-05-20` as
 * arithmetic on the leading-zero integer literal `05`.
 */
export const dqlTimeArg = (s: string): string => {
  if (!s) return s;
  if (s.startsWith('"')) return s;
  if (/\d{4}-\d{2}-\d{2}T/.test(s)) return `"${dqlEscape(s)}"`;
  return s;
};

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
  filters?: GlobalFilters,
): string => {
  const toClause = dqlTimeArg(timeframe.to ?? "now()");
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${toClause}, scanLimitGBytes: 200
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.agent.name)
| summarize agents = countDistinct(gen_ai.agent.name)
`.trim();
};

export const buildToolCountQuery = (
  serviceIds: string[] | null,
  timeframe: { from: string; to?: string },
  filters?: GlobalFilters,
): string => {
  const toClause = dqlTimeArg(timeframe.to ?? "now()");
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${toClause}, scanLimitGBytes: 200
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
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

export interface FilterCondition {
  attribute: string;
  values: string[];
}

export interface GlobalFilters {
  conditions: FilterCondition[];
}

/** Only allow well-formed attribute paths to be interpolated as a DQL field. */
const SAFE_ATTR_RE = /^[A-Za-z][A-Za-z0-9_.]*$/;

/**
 * Emit a DQL filter pipe for each global filter condition. Values are matched
 * with `isNull(attr) OR in(toString(attr), array(...))` — the soft-filter
 * pattern — so the comparison works regardless of the attribute's underlying
 * type (string / long / boolean). Conditions AND together; values within a
 * condition OR together.
 *
 * Soft-filter semantics: a span that does NOT carry the filtered attribute
 * (isNull) is included rather than excluded. This makes cross-page navigation
 * useful: filtering on `traceloop.entity.name = GetEmailsFromFolder` (an MCP
 * attribute) and navigating to the Prompts page shows all LLM prompts instead
 * of 0, because LLM spans don't have that attribute. Pages whose spans DO
 * carry the attribute still filter exactly as expected — the isNull guard is
 * only true when the attribute is absent.
 *
 * For universal attributes (trace.id, span.id, service.name) that exist on
 * every span, isNull is always false and the behavior is identical to a hard
 * filter. Callers that need a hard filter regardless should use
 * ignoreGlobalFilter and apply their own filtering.
 */
const emitConditionPipes = (f?: GlobalFilters): string =>
  (f?.conditions ?? [])
    .filter(
      (c) =>
        c &&
        SAFE_ATTR_RE.test(c.attribute) &&
        Array.isArray(c.values) &&
        c.values.length > 0,
    )
    .map(
      (c) =>
        `| filter isNull(${c.attribute}) or in(toString(${c.attribute}), array(${dqlIdArray(c.values)}))`,
    )
    .join("\n");

/**
 * @deprecated Inline filtering is now applied centrally by
 * `injectGlobalFilters` in `useScopedDql`, so every `fetch spans/logs` query
 * inherits the global filter without each builder threading it. Builders may
 * still call this (it returns "") which keeps their `filters` param live and
 * forward-compatible. Do not add new call sites.
 */
export const globalFilterClauses = (_f?: GlobalFilters): string => "";

/**
 * Insert the global filter pipes immediately after the first
 * `fetch spans|logs …` statement in a query. Used by useScopedDql so the
 * active global filter applies to every data query in the app.
 */
export const injectGlobalFilters = (
  query: string,
  f?: GlobalFilters,
): string => {
  const pipes = emitConditionPipes(f);
  if (!pipes || !query) return query;
  return query.replace(
    /^(\s*fetch\s+(?:spans|logs)\b[^\n]*\n)/m,
    `$1${pipes}\n`,
  );
};

export const buildFilterOptionsQuery = (
  serviceIds: string[] | null,
  timeframe: { from: string; to?: string },
): string => {
  const toClause = dqlTimeArg(timeframe.to ?? "now()");
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${toClause}, scanLimitGBytes: 200
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name) or isNotNull(gen_ai.agent.name)
| summarize
    agents = collectDistinct(gen_ai.agent.name),
    models = collectDistinct(gen_ai.request.model),
    providers = collectDistinct(gen_ai.provider.name)
`.trim();
};
