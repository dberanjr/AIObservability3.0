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

/**
 * Build a DQL query targeting the relevant spans, then route through Notebooks
 * (or whichever app the user has installed that handles `dt.query`).
 */
export const openInTraces = (ctx: IntentContext = {}): void => {
  const filters: string[] = [];
  if (ctx.traceId) filters.push(`trace.id == "${ctx.traceId}"`);
  if (ctx.spanId) filters.push(`span.id == "${ctx.spanId}"`);
  if (ctx.entityId) filters.push(`dt.entity.service == "${ctx.entityId}"`);
  const dql =
    ctx.dql ??
    [
      "fetch spans, from: now()-24h, to: now()",
      ...(filters.length ? [`| filter ${filters.join(" and ")}`] : []),
      "| sort timestamp desc",
      "| limit 200",
    ].join("\n");
  safeSend(
    { "dt.query": dql, ...(ctx.traceId ? { trace_id: ctx.traceId } : {}) },
    {
      recommendedAppId: KNOWN_NOTEBOOKS_APP_ID,
      recommendedIntentId: NOTEBOOKS_VIEW_QUERY_INTENT_ID,
    },
  );
};

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
