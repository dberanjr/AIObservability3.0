import { sendIntent } from "@dynatrace-sdk/navigation";

/**
 * Thin wrappers around `sendIntent`. Payload shapes follow the Dynatrace
 * intent-matching convention — the platform routes to whichever installed
 * app declares a matching intent. We pass entity names + identifiers so
 * Distributed Traces / Services / Problems / Notebooks can each pre-filter
 * to the right context.
 *
 * Errors from sendIntent are intentionally swallowed: an intent that can't
 * be matched should fall back to the platform's default handler, not blow up
 * the calling button.
 */

interface IntentContext {
  /** Entity name (service, agent, tool, model). */
  entity?: string;
  /** Optional traceId when launching a trace view. */
  traceId?: string;
  /** Optional spanId when launching a span view. */
  spanId?: string;
}

const safeSend = (payload: Record<string, unknown>): void => {
  try {
    sendIntent(payload);
  } catch {
    /* swallow — see module docblock */
  }
};

export const openInTraces = (ctx: IntentContext = {}): void => {
  const payload: Record<string, unknown> = { type: "trace" };
  if (ctx.traceId) payload["trace.id"] = ctx.traceId;
  if (ctx.spanId) payload["span.id"] = ctx.spanId;
  if (ctx.entity) payload["entity.name"] = ctx.entity;
  safeSend(payload);
};

export const openInServices = (ctx: IntentContext = {}): void => {
  const payload: Record<string, unknown> = { type: "service" };
  if (ctx.entity) payload["entity.name"] = ctx.entity;
  safeSend(payload);
};

export const openInProblems = (ctx: IntentContext = {}): void => {
  const payload: Record<string, unknown> = { type: "problem" };
  if (ctx.entity) payload["affected.entity.name"] = ctx.entity;
  safeSend(payload);
};

export const openInNotebooks = (ctx: IntentContext = {}): void => {
  const payload: Record<string, unknown> = { type: "notebook" };
  if (ctx.entity) payload["entity.name"] = ctx.entity;
  safeSend(payload);
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
