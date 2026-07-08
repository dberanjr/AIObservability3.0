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
  /**
   * For the default `"in"` op these are the literal values to match
   * (`in(toString(attribute), array(values))`). For the `"exists"` op they are
   * span attribute NAMES whose presence is tested (`isNotNull(name) or …`),
   * OR-joined — this lets one condition cover attribute synonyms (e.g. the
   * three TTFT variants). `attribute` is then just the display key.
   */
  values: string[];
  /** Match mode. Omitted = "in" (value match). "exists" = presence of any
   *  attribute named in `values`. */
  op?: "in" | "exists";
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
  validConditions(f)
    .map((c) => `| filter ${conditionPredicate(c)}`)
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

/**
 * Parse the Tweaks span-bucket field (a comma-separated list) into a clean,
 * de-duplicated array of bucket names. Whitespace is trimmed and empties are
 * dropped, so "bos_spans, genai_spans," → ["bos_spans", "genai_spans"].
 */
export const parseBuckets = (text: string): string[] => {
  const seen = new Set<string>();
  for (const raw of (text ?? "").split(",")) {
    const b = raw.trim();
    if (b) seen.add(b);
  }
  return [...seen];
};

/**
 * Insert an OR-of-buckets partition filter after EVERY `fetch spans` statement
 * — spans only, never logs (the tweak restricts *span* buckets). `dt.system.bucket`
 * is a Grail partition key, so `| filter in(dt.system.bucket, {...})` prunes the
 * scan to the named buckets (measured on ualpre: 500 GB → 4.74 GB for one bucket).
 * No-op when `buckets` is empty, leaving the query (and its query key) stable.
 */
export const injectBucketFilter = (
  query: string,
  buckets: string[],
): string => {
  if (!query || !buckets || buckets.length === 0) return query;
  const list = buckets.map((b) => `"${dqlEscape(b)}"`).join(", ");
  const pipe = `| filter in(dt.system.bucket, {${list}})`;
  return query.replace(/^([ \t]*fetch\s+spans\b[^\n]*)$/gm, `$1\n${pipe}`);
};

/* ------------------------------------------------------------------ *
 * HYBRID global filtering — per-attribute partition
 *
 * The global filter is applied two ways depending on the attribute, so that
 * cross-span entity filters work again WITHOUT reintroducing the high-volume
 * expression-limit crash:
 *
 *  1. DIRECT injection (`injectGlobalFilters`) for the high-volume / same-span
 *     attributes (model, service, provider, system, status, workflow, …).
 *     Each condition is injected as `| filter in(toString(attr), array(...))`
 *     on the page's own spans — uncapped and exact, with no trace-id
 *     materialisation, so a busy model filter (10k+ traces) cannot crash.
 *
 *  2. TRACE-SCOPE injection (`buildTraceScopeQuery` + `injectTraceScope`) for
 *     the low-volume cross-span ENTITY attributes in `TRACE_SCOPED_ATTRS`
 *     (agent name, tool name). These live on a specific span type (the agent
 *     span / the tool span) but must filter pages built on OTHER span types
 *     (e.g. the Prompts page reads LLM spans, which carry no gen_ai.agent.name).
 *     A resolver query finds the trace.ids where ANY span matches, and every
 *     page query gets `| filter in(trace.id, array(toUid(...)))`. A specific
 *     agent/tool resolves to FEW traces (bos-agcre-test ≈ 10), so the injected
 *     id list stays far under DQL's ~1000-expression limit. The resolved set is
 *     capped at SAFE_TRACE_CAP as a hard safety bound.
 *
 * Both paths AND together: "agent X + model Y" on the Prompts page injects the
 * direct model filter on LLM spans AND scopes to agent X's trace.ids = LLM
 * spans of model Y in traces where agent X ran. Correct cross-span semantics.
 *
 * Why model/service are NOT trace-scoped: they are high-cardinality and live on
 * the same span the data pages query, so direct injection is both exact and
 * crash-proof. Resolving them to trace.ids would reproduce the
 * TOO_MANY_EXPRESSIONS_IN_QUERY failure that motivated this design.
 * ------------------------------------------------------------------ */

/**
 * Attributes routed to TRACE-SCOPE injection instead of direct per-span
 * injection. Keep this to LOW-VOLUME, SPAN-SPECIFIC entity attributes that need
 * cross-span coverage. Deliberately excludes high-cardinality / same-span
 * attributes (model, service, provider, system, status, workflow) — those go
 * through direct injection so they stay uncapped and never hit the DQL
 * expression limit.
 */
export const TRACE_SCOPED_ATTRS = new Set<string>([
  "gen_ai.agent.name",
  "gen_ai.tool.name",
]);

/**
 * Maximum number of resolved trace.ids injected per page query. Each id becomes
 * one `toUid("…")` call inside a SINGLE `in(trace.id, array(...))` expression —
 * and DQL caps *sub-expressions per expression* at 250 (EXPRESSION_TOO_MANY_SUB_
 * EXPRESSIONS, "DQL-LIMIT-REACHED"), NOT the ~1000 query-wide limit assumed
 * earlier. So array(toUid×N) + in() overflows once N approaches 248 — an 800 cap
 * crashed any focus/global-filter that resolved >~248 traces (e.g. History
 * growth → 268 traces). 240 stays safely under the 250 ceiling while still
 * covering any realistic single agent/tool (a handful to low-hundreds of
 * traces) and over-filling the ~200-row sampled list. The resolver requests
 * cap+1 so the UI can flag truncation; injectTraceScope hard-caps as a backstop.
 * Verified on ualpre: array(toUid×256) → EXPRESSION_TOO_MANY_SUB_EXPRESSIONS
 * (max 250); ×240 parses cleanly.
 */
export const SAFE_TRACE_CAP = 240;

/**
 * Split active conditions into the two injection paths. `scope` conditions
 * (attributes in TRACE_SCOPED_ATTRS) resolve to trace.ids; `direct` conditions
 * inject per-span. Malformed conditions are dropped from both (see
 * `validConditions`).
 */
export const partitionConditions = (
  conditions?: FilterCondition[],
): { direct: FilterCondition[]; scope: FilterCondition[] } => {
  const valid = validConditions({ conditions: conditions ?? [] });
  const direct: FilterCondition[] = [];
  const scope: FilterCondition[] = [];
  for (const c of valid) {
    // "exists" conditions are presence checks that must reach pages built on
    // OTHER span types (e.g. a TTFT LLM-span presence filter scoping the Agents
    // and Explorer tabs), so they always go through trace-scope resolution —
    // same as the cross-span entity attributes.
    const toScope = c.op === "exists" || TRACE_SCOPED_ATTRS.has(c.attribute);
    (toScope ? scope : direct).push(c);
  }
  return { direct, scope };
};

/**
 * A DQL predicate for one condition (values OR within the condition). Used both
 * for direct per-span injection and as the trace-scope resolver's countIf test.
 *   - "in"     → `in(toString(attr), array("v1", "v2"))`
 *   - "exists" → `(isNotNull(attr1) or isNotNull(attr2))` over the attribute
 *                NAMES in `values` (each already validated against SAFE_ATTR_RE).
 */
const conditionPredicate = (c: FilterCondition): string =>
  c.op === "exists"
    ? `(${c.values.map((a) => `isNotNull(${a})`).join(" or ")})`
    : `in(toString(${c.attribute}), array(${dqlIdArray(c.values)}))`;

/**
 * True when the global filter has at least one valid attribute condition.
 * Centralises the "is the filter on?" test for the filter context + strip.
 */
export const hasActiveFilter = (f?: GlobalFilters): boolean =>
  validConditions(f).length > 0;

/**
 * Filter conditions that are well-formed and carry at least one value. For
 * "exists" conditions the values are attribute NAMES interpolated bare into DQL,
 * so every one must pass SAFE_ATTR_RE; for "in" conditions the values are string
 * literals (safely quoted by dqlIdArray) and may be anything non-empty.
 */
export const validConditions = (f?: GlobalFilters): FilterCondition[] =>
  (f?.conditions ?? []).filter((c) => {
    if (
      !c ||
      !SAFE_ATTR_RE.test(c.attribute) ||
      !Array.isArray(c.values) ||
      c.values.length === 0
    ) {
      return false;
    }
    if (c.op === "exists") {
      return c.values.every(
        (v) => typeof v === "string" && SAFE_ATTR_RE.test(v),
      );
    }
    return true;
  });

/**
 * Build the trace-scope resolver query for the SCOPE subset of conditions
 * (caller passes only the TRACE_SCOPED_ATTRS conditions — see
 * `partitionConditions`). Returns every trace.id whose trace satisfies ALL
 * passed conditions, where a condition is satisfied when ANY span in the trace
 * matches it (countIf + having c_i > 0 across conditions; values OR within a
 * condition). Runs at full fidelity (samplingRatio: 1) so it never misses a
 * matching trace; pages then sample independently within the resolved scope.
 *
 * `cap` bounds the result; cap+1 is requested so the caller can detect
 * truncation. Pass `Infinity` for no cap (not used in practice — the hybrid
 * design always passes SAFE_TRACE_CAP).
 */
export const buildTraceScopeQuery = (
  timeframe: { from: string; to?: string },
  f: GlobalFilters,
  cap: number,
): string => {
  const preds = validConditions(f).map(conditionPredicate);
  const counters = preds.map((p, i) => `c${i} = countIf(${p})`).join(",\n    ");
  const having = preds.map((_, i) => `c${i} > 0`).join(" and ");
  const orAll = preds.join(" or ");
  const limit = Number.isFinite(cap) ? `\n| limit ${cap + 1}` : "";
  const toClause = dqlTimeArg(timeframe.to ?? "now()");
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${toClause}
| filter ${orAll}
| summarize
    ${counters},
    by: { trace.id }
| filter ${having}
| fields trace_id = toString(trace.id)${limit}
`.trim();
};

/** Sentinel uid (a syntactically valid all-zero trace id) that matches no real
 *  trace — injected when scope conditions are active but resolve to zero
 *  traces, so downstream pages correctly render empty. */
const NO_MATCH_TRACE_ID = "00000000000000000000000000000000";

/**
 * Inject a `| filter in(trace.id, array(toUid(...)))` after EVERY
 * `fetch spans|logs` statement (including any nested span fetch in a join) so
 * the resolved trace scope applies app-wide. `trace.id` is a uid column, so ids
 * are wrapped in `toUid(...)` — comparing the column to bare strings matches
 * nothing. `traceIds === null` means no scope conditions are active (query
 * returned unchanged); an empty array means the scope matched nothing (the
 * no-match sentinel is injected so pages render empty).
 */
export const injectTraceScope = (
  query: string,
  traceIds: string[] | null,
): string => {
  if (traceIds === null || !query) return query;
  // Hard backstop against the 250-sub-expressions-per-expression DQL limit: the
  // injected `in(trace.id, array(toUid×N))` is a single expression, so N must
  // stay under ~248 no matter what the caller passed (callers should already cap
  // at SAFE_TRACE_CAP, but this guarantees the query never throws).
  const ids = (traceIds.length > 0 ? traceIds : [NO_MATCH_TRACE_ID]).slice(
    0,
    SAFE_TRACE_CAP,
  );
  const pipe = `| filter in(trace.id, array(${dqlUidArray(ids)}))`;
  return query.replace(
    /^([ \t]*fetch\s+(?:spans|logs)\b[^\n]*)$/gm,
    `$1\n${pipe}`,
  );
};


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
