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

/**
 * Bracket a `fetch spans` window around a known epoch-ms timestamp. A ±30m
 * pad comfortably contains a trace while keeping the scan tiny. Falls back to
 * the last 24h when no timestamp is known (e.g. entity-only finding drills).
 */
const traceWindow = (startMs?: number): { from: string; to: string } => {
  if (typeof startMs === "number" && Number.isFinite(startMs)) {
    const pad = 30 * 60 * 1000;
    return {
      from: `"${new Date(startMs - pad).toISOString()}"`,
      to: `"${new Date(startMs + pad).toISOString()}"`,
    };
  }
  return { from: "now()-24h", to: "now()" };
};

const dqlStr = (s: string): string => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/**
 * Build a "trace exemplar" DQL query — one whose result columns are exactly
 * `trace.id` (uid) + `start_time` (timestamp). That pairing is what the
 * platform's intent resolver recognises as trace-shaped, surfacing (and
 * recommending) the Distributed Tracing app in "Open with…". See the
 * trace-exemplar pattern in the Application Tracing docs.
 */
const buildTraceExemplarQuery = (ctx: IntentContext): string => {
  const { from, to } = traceWindow(ctx.startMs);
  const filters: string[] = [];
  if (ctx.traceId) {
    filters.push(`trace.id == toUid("${dqlStr(ctx.traceId)}")`);
  } else if (ctx.entityId) {
    filters.push(`dt.entity.service == "${dqlStr(ctx.entityId)}"`);
  } else if (ctx.entity) {
    // Findings pass a display name, not an id — match the common gen_ai
    // naming attributes so an entity-scoped drill still lands on its traces.
    const e = dqlStr(ctx.entity);
    filters.push(
      `(contains(gen_ai.agent.name, "${e}") or contains(gen_ai.request.model, "${e}") or contains(dt.service.name, "${e}"))`,
    );
  }
  return [
    `fetch spans, from: ${from}, to: ${to}`,
    ...(filters.length ? [`| filter ${filters.join(" and ")}`] : []),
    "| summarize { count(), trace = takeAny(record(start_time, trace.id)) }, by: { trace.id }",
    "| fields trace.id = trace[trace.id], start_time = trace[start_time], spans = `count()`",
    "| sort start_time desc",
    "| limit 50",
  ].join("\n");
};

/**
 * Drill into a distributed trace. Builds a trace-exemplar query (result =
 * trace.id + start_time) and sends it UNPINNED so the platform routes it to
 * the Distributed Tracing app's waterfall view. We deliberately do NOT pin
 * `recommendedAppId`/`recommendedIntentId` here: the Distributed Tracing app
 * registers itself as the handler for trace-shaped results, and pinning the
 * Notebooks app (the previous behaviour) is exactly what forced these drills
 * into a notebook instead of the trace view.
 */
export const openInTraces = (ctx: IntentContext = {}): void => {
  const dql = ctx.dql ?? buildTraceExemplarQuery(ctx);
  safeSend({ "dt.query": dql });
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
