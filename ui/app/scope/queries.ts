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

/** MCP protocol lifecycle methods — these are NOT tool calls. Single source of
 *  truth; mirror any change across every tool classifier. */
export const MCP_LIFECYCLE_METHODS = ["tools/list", "initialize", "notifications/initialized", "ping"] as const;

/** DQL predicate (string) that is TRUE for spans that are NOT an MCP lifecycle
 *  call. Null-tolerant: a span with no mcp.method.name (every non-MCP span)
 *  passes. Use inside tool-classification branches.
 *
 * CRITICAL: the null guard is load-bearing. A bare `mcp.method.name != "x"` AND
 * chain evaluates to NULL (falsy) for every span where mcp.method.name is NULL
 * (i.e. every non-MCP tool span), which misclassifies genuine tool spans as
 * orchestration. The leading isNull(...) makes those spans pass. */
export const mcpNotLifecycleClause = (): string =>
  `(isNull(mcp.method.name) or (${MCP_LIFECYCLE_METHODS.map((m) => `mcp.method.name != "${m}"`).join(" and ")}))`;

/**
 * Format a list of ids as `uid`-typed DQL array elements:
 * `toUid("id1"), toUid("id2"), ...`. `trace.id` / `span.id` are uid columns —
 * comparing them to bare string literals silently matches nothing, so any
 * `in(trace.id, …)` must wrap each id in `toUid(...)`.
 */
export const dqlUidArray = (ids: string[]): string =>
  ids.map((id) => `toUid("${dqlEscape(id)}")`).join(", ");

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
 * Logical-error predicate for AI spans (DQL boolean, unquoted field style to
 * match the page query builders). Goes beyond transport failures to count
 * *logical* failures the LLM layer signals on otherwise-HTTP-200 responses:
 *   - span.status_code == error (OTel span status)
 *   - http.response.status_code >= 400 (transport error)
 *   - exception.type present (thrown error)
 *   - gen_ai.error.code present (provider-reported error)
 *   - finish_reasons contains "refusal" / "content_filter" (model declined or
 *     was guardrail-blocked — a logical failure on a 200 response)
 *
 * Validated on united nonprod: catches ~3x more failures than the prior
 * exception-or-http>=400 rule (logical failures are otherwise invisible
 * because nearly all spans are HTTP 200 with an unset span.status_code).
 */
export const LOGICAL_ERROR_EXPR = `(
    lower(coalesce(span.status_code, "")) == "error"
    or toLong(coalesce(http.response.status_code, 0)) >= 400
    or isNotNull(exception.type)
    or isNotNull(gen_ai.error.code)
    or contains(lower(toString(gen_ai.response.finish_reasons)),"refusal")
    or contains(lower(toString(gen_ai.response.finish_reasons)),"content_filter")
  )`;

/**
 * Emit a `<field> = if(<logical error>, 1, else: 0)` assignment for use inside
 * a `| fieldsAdd` so a downstream `sum(<field>)` counts logical errors.
 */
export const logicalErrorField = (field = "is_error"): string =>
  `${field} = if(${LOGICAL_ERROR_EXPR}, 1, else: 0)`;

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
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${toClause}
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
  // Count both real tool spans (gen_ai.tool.name) and "discovered" tools
  // (internal/client function spans under an agent that aren't LLM calls or the
  // agent root) — the same population the Tools page lists. On tenants that
  // don't emit gen_ai.tool.name this is what keeps the status line from
  // reading "0 tools". Approximate under the scan cap (high-volume compute
  // tools dominate the scan); the Tools page is the authoritative view.
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${toClause}
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(gen_ai.tool.name) or (isNotNull(gen_ai.agent.name) and (span.kind == "internal" or span.kind == "client") and isNull(gen_ai.provider.name) and isNull(gen_ai.request.model) and span.name != gen_ai.agent.name)
| fieldsAdd tname = coalesce(gen_ai.tool.name, span.name)
| summarize tools = countDistinct(tname)
`.trim();
};

/** Distinct-services count for the status line. */
export const FLEET_SERVICE_COUNT_QUERY = `
fetch spans, samplingRatio: 1, from: now()-24h
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
 * with `in(toString(<attr>), array(...))` so the comparison works regardless
 * of the attribute's underlying type (string / long / boolean). Conditions
 * AND together; values within a condition OR together.
 *
 * This is a hard filter: every active filter condition must match on every
 * span. Spans whose span type doesn't carry the filtered attribute will return
 * 0 results for that page — that is the correct filtered result (the data
 * genuinely doesn't satisfy the condition).
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
        `| filter in(toString(${c.attribute}), array(${dqlIdArray(c.values)}))`,
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
 * Insert the global filter pipes immediately after EVERY
 * `fetch spans|logs …` statement in a query (including any nested span/log
 * fetch inside a join). Used by useScopedDql so the active global filter
 * applies to every data query in the app, uncapped and exact. No-ops when the
 * filter has no valid conditions, leaving the query (and its query key) stable.
 */
export const injectGlobalFilters = (
  query: string,
  f?: GlobalFilters,
): string => {
  const pipes = emitConditionPipes(f);
  if (!pipes || !query) return query;
  return query.replace(
    /^([ \t]*fetch\s+(?:spans|logs)\b[^\n]*)$/gm,
    `$1\n${pipes}`,
  );
};

/* ------------------------------------------------------------------ *
 * Active-filter helpers
 *
 * The global filter is applied via DIRECT per-span condition injection
 * (`injectGlobalFilters` above): every page query is filtered by the active
 * conditions on its own spans — uncapped and exact, with no trace-id
 * materialisation (so no DQL expression-limit crash on busy attributes).
 *
 * Trade-off: each condition must match on the page's OWN spans. A
 * multi-attribute filter whose attributes live on DIFFERENT span types (e.g.
 * agent name on the agent span + model on the LLM span) won't co-match per
 * span. Filters that share a span (model + service on the LLM span) work
 * exactly. The prior trace-id resolver handled the cross-span case but capped
 * the match set and crashed past DQL's 1000-expression limit on busy models —
 * which is the failure this change removes.
 * ------------------------------------------------------------------ */

/**
 * True when the global filter has at least one valid attribute condition.
 * Centralises the "is the filter on?" test for the filter context + strip.
 */
export const hasActiveFilter = (f?: GlobalFilters): boolean =>
  validConditions(f).length > 0;

/** Filter conditions that are well-formed and carry at least one value. */
export const validConditions = (f?: GlobalFilters): FilterCondition[] =>
  (f?.conditions ?? []).filter(
    (c) =>
      c &&
      SAFE_ATTR_RE.test(c.attribute) &&
      Array.isArray(c.values) &&
      c.values.length > 0,
  );


export const buildFilterOptionsQuery = (
  serviceIds: string[] | null,
  timeframe: { from: string; to?: string },
): string => {
  const toClause = dqlTimeArg(timeframe.to ?? "now()");
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${toClause}
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name) or isNotNull(gen_ai.agent.name)
| summarize
    agents = collectDistinct(gen_ai.agent.name),
    models = collectDistinct(gen_ai.request.model),
    providers = collectDistinct(gen_ai.provider.name)
`.trim();
};
