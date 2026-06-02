import { sendIntent, type SendIntentOptions } from "@dynatrace-sdk/navigation";

/**
 * Cross-app navigation via the Dynatrace intent system.
 *
 * Per https://developer.dynatrace.com/develop/guides/navigation/intents/send-intents/
 * `sendIntent(payload, options?)` takes a key/value payload (NOT a typed object)
 * plus optional `recommendedAppId` / `recommendedIntentId` to bypass the
 * "Open with..." dialog. Payload keys must follow the platform's semantic
 * dictionary so the receiving app can match — common ones:
 *   - `dt.query`              → DQL statement (Notebooks, Trace Explorer)
 *   - `dt.entity.service`     → service entity ID
 *   - `dt.entity.host`        → host entity ID
 *   - `dt.davis.problem.id`   → Davis problem ID
 *   - `trace_id`              → distributed trace identifier
 *   - `span.id`               → span identifier
 *
 * Errors from sendIntent are swallowed: a failed intent should fall back to
 * the platform's default "Open with..." picker, not blow up the caller.
 */

const KNOWN_NOTEBOOKS_APP_ID = "dynatrace.notebooks";
const NOTEBOOKS_VIEW_QUERY_INTENT_ID = "view-query";

interface IntentContext {
  /** Display name of the entity (service / agent / tool / model). */
  entity?: string;
  /** Dynatrace entity ID (e.g. SERVICE-1234ABCD…). */
  entityId?: string;
  /** Trace ID for span/trace-scoped drills. */
  traceId?: string;
  /** Span ID for span-scoped drills. */
  spanId?: string;
  /**
   * Epoch-ms timestamp of the record being drilled into. Used to bracket the
   * `fetch spans` window tightly around the trace so the Distributed Tracing
   * app finds it fast (Grail is time-partitioned) without scanning 24h.
   */
  startMs?: number;
  /** Davis problem ID. */
  problemId?: string;
  /** Optional pre-built DQL query the receiving app should run. */
  dql?: string;
}

type IntentPayload = Record<string, unknown>;

const safeSend = (
  payload: IntentPayload,
  options?: SendIntentOptions<IntentPayload>,
): void => {
  try {
    if (options) {
      sendIntent(payload, options);
    } else {
      sendIntent(payload);
    }
  } catch {
    /* swallow — see module docblock */
  }
};

const dqlStr = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/**
 * The Distributed Tracing app handles the `view-traces` intent, which takes a
 * `dt.filter` (its own filter DSL — NOT DQL) plus a `dt.timeframe`. This is the
 * contract observed from the Services app's "View traces" link, e.g.:
 *   /ui/intent/dynatrace.distributedtracing/view-traces#
 *     {"dt.filter":"dt.smartscape.service = SERVICE-… AND
 *       dt.smartscape.service.entity.name = ReserveController",
 *      "dt.timeframe":{ "from": "…", "to": "…" }}
 * The app does NOT handle `dt.query`, so the previous exemplar approach never
 * surfaced it in "Open with…".
 */
const DT_TRACING_APP_ID = "dynatrace.distributedtracing";
const DT_VIEW_TRACES_INTENT_ID = "view-traces";

/**
 * Absolute ISO timeframe bracketing the record (±30m). Wide enough to contain
 * the trace, tight enough that the Distributed Tracing app loads quickly.
 */
const traceTimeframe = (startMs?: number): { from: string; to: string } => {
  if (typeof startMs === "number" && Number.isFinite(startMs)) {
    const pad = 30 * 60 * 1000;
    return {
      from: new Date(startMs - pad).toISOString(),
      to: new Date(startMs + pad).toISOString(),
    };
  }
  const now = Date.now();
  return {
    from: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    to: new Date(now).toISOString(),
  };
};

/**
 * Build the `dt.filter` value for the view-traces intent. Trace/entity ids are
 * single tokens (no spaces) so they pass unquoted, matching the Services app's
 * generated filter; a display name is quoted in case it contains spaces.
 */
const buildTraceFilter = (ctx: IntentContext): string | null => {
  if (ctx.traceId) return `trace.id = ${ctx.traceId}`;
  if (ctx.entityId) return `dt.smartscape.service = ${ctx.entityId}`;
  if (ctx.entity)
    return `dt.smartscape.service.entity.name = "${dqlStr(ctx.entity)}"`;
  return null;
};

/**
 * Drill into a distributed trace — opens the Distributed Tracing app directly
 * on the trace via its `view-traces` intent (pinned, so no "Open with…"
 * picker). The DT app cannot be embedded in an <iframe> (platform CSP blocks
 * it), so this navigates; the in-app modal renders our own waterfall instead.
 */
export const openInTraces = (ctx: IntentContext = {}): void => {
  const filter = buildTraceFilter(ctx);
  const payload: IntentPayload = { "dt.timeframe": traceTimeframe(ctx.startMs) };
  if (filter) payload["dt.filter"] = filter;
  safeSend(payload, {
    recommendedAppId: DT_TRACING_APP_ID,
    recommendedIntentId: DT_VIEW_TRACES_INTENT_ID,
  });
};

export type { IntentContext };

/**
 * Service-entity intent — `dt.entity.service` is the canonical semantic key,
 * routed by the platform to whichever app declares an intent for it
 * (typically the Services app).
 */
export const openInServices = (ctx: IntentContext = {}): void => {
  if (ctx.entityId) {
    safeSend({ "dt.entity.service": ctx.entityId });
    return;
  }
  // Fallback to a DQL query in Notebooks when we only have a display name.
  const dql =
    ctx.dql ??
    [
      "fetch dt.entity.service",
      ...(ctx.entity ? [`| filter contains(entity.name, "${ctx.entity}")`] : []),
    ].join("\n");
  safeSend(
    { "dt.query": dql },
    {
      recommendedAppId: KNOWN_NOTEBOOKS_APP_ID,
      recommendedIntentId: NOTEBOOKS_VIEW_QUERY_INTENT_ID,
    },
  );
};

/**
 * Davis problem intent — `dt.davis.problem.id` is the canonical key.
 */
export const openInProblems = (ctx: IntentContext = {}): void => {
  if (ctx.problemId) {
    safeSend({ "dt.davis.problem.id": ctx.problemId });
    return;
  }
  const dql =
    ctx.dql ??
    [
      "fetch events",
      '| filter event.kind == "DAVIS_PROBLEM"',
      ...(ctx.entityId
        ? [`| filter affected_entity_ids == "${ctx.entityId}"`]
        : []),
      "| sort event.start desc",
      "| limit 50",
    ].join("\n");
  safeSend(
    { "dt.query": dql },
    {
      recommendedAppId: KNOWN_NOTEBOOKS_APP_ID,
      recommendedIntentId: NOTEBOOKS_VIEW_QUERY_INTENT_ID,
    },
  );
};

/**
 * Generic Notebook open — accepts either a pre-built DQL string or context to
 * derive one from. Routes explicitly to Notebooks so the user is dropped into
 * a runnable cell rather than the "Open with..." picker.
 */
export const openInNotebooks = (ctx: IntentContext = {}): void => {
  const dql =
    ctx.dql ??
    [
      "fetch spans, from: now()-1h, to: now()",
      ...(ctx.entityId
        ? [`| filter dt.entity.service == "${ctx.entityId}"`]
        : ctx.entity
          ? [`| filter contains(gen_ai.agent.name, "${ctx.entity}")`]
          : []),
      "| limit 200",
    ].join("\n");
  safeSend(
    { "dt.query": dql },
    {
      recommendedAppId: KNOWN_NOTEBOOKS_APP_ID,
      recommendedIntentId: NOTEBOOKS_VIEW_QUERY_INTENT_ID,
    },
  );
};

export type IntentKind = "traces" | "services" | "problems" | "notebooks";

export const dispatchIntent = (
  kind: IntentKind,
  ctx: IntentContext = {},
): void => {
  switch (kind) {
    case "traces":
      openInTraces(ctx);
      return;
    case "services":
      openInServices(ctx);
      return;
    case "problems":
      openInProblems(ctx);
      return;
    case "notebooks":
      openInNotebooks(ctx);
      return;
  }
};
