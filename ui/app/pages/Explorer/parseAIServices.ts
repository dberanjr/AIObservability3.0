/**
 * Pure record → AIService parsing for the AI-services catalog
 * (`buildAIServicesQuery`). Extracted out of `useAIServices.ts` (a React hook
 * module that transitively imports React/DOM-dependent packages) into its own
 * React-free module so both the hook AND `demoData.ts` / its test can import
 * the exact same parse function — the demo dataset is built from small raw
 * "record" fixtures piped through this real parser rather than hand-typed
 * AIService objects, and vitest's node test runner can import it directly
 * (importing the hook file itself throws under node — no `document`).
 */

import { toNum } from "../../data/format";
import {
  normalizeProvider,
  canonicalizeModel,
  type ProviderId,
} from "../../detection/attributes";

/** One row returned by `buildAIServicesQuery` (per-service aggregate). */
export interface ServiceRecord {
  service?: string;
  service_id?: string;
  requests?: number;
  tokens?: number;
  in_tokens?: number;
  out_tokens?: number;
  errors?: number;
  logical_errors?: number;
  agents?: number;
  agent_names?: Array<string | null>;
  models?: string[];
  framework?: string;
  tok_per_req?: number;
  error_rate_pct?: number;
}

export interface AIService {
  serviceId: string;
  service: string;
  framework: string | null;
  models: string[];
  modelDisplay: string[];
  agentNames: string[];
  providers: ProviderId[];
  requests: number;
  tokens: number;
  /** Aggregate input tokens across the service's models (for cost estimation). */
  inTok: number;
  /** Aggregate output tokens across the service's models (for cost estimation). */
  outTok: number;
  tokPerReq: number;
  agents: number;
  errors: number;
  errorRatePct: number;
  logicalErrors: number;
}

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

/** Fold one raw `buildAIServicesQuery` row into a UI-ready AIService, or
 *  `null` when the row is missing its identity fields. Pure — reused by both
 *  `useAIServices` (real data) and `demoData.ts` (canned fixtures) so every
 *  derived field (provider set, canonical model labels, coerced numbers) is
 *  computed by the SAME logic regardless of source. */
export const toService = (r: ServiceRecord): AIService | null => {
  if (!r.service || !r.service_id) return null;
  // DQL's collectDistinct(gen_ai.request.model) can include nulls for spans
  // that have an agent but no model — strip them before any string ops.
  const models = (r.models ?? []).filter(
    (m): m is string => typeof m === "string" && m.length > 0,
  );
  const providers = Array.from(
    new Set(models.map((m) => normalizeProvider(undefined, m).id)),
  );
  return {
    serviceId: r.service_id,
    service: r.service,
    framework: r.framework ?? null,
    models,
    agentNames: (r.agent_names ?? []).filter(
      (a): a is string => typeof a === "string" && a.length > 0,
    ),
    modelDisplay: Array.from(
      new Set(models.map((m) => canonicalizeModel(m).label)),
    ),
    providers,
    requests: num(r.requests),
    tokens: num(r.tokens),
    inTok: num(r.in_tokens),
    outTok: num(r.out_tokens),
    tokPerReq: num(r.tok_per_req),
    agents: num(r.agents),
    errors: num(r.errors),
    errorRatePct: num(r.error_rate_pct),
    logicalErrors: num(r.logical_errors),
  };
};
