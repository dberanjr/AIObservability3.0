/**
 * Canned Demo Mode dataset for the Explorer page (mirrors
 * `ui/app/bedrock/demoData.ts`'s design).
 *
 * Design: rather than hand-writing each hook's *output* shape directly, this
 * module builds one small set of "raw record" fixtures — `SEED_CELLS`, shaped
 * exactly like what the heatmap / AI-services / service-model-detail query
 * builders in `./queries.ts` return per (service, model) pair — then
 * derives every hook's demo constant from it via the SAME parse/fold
 * functions production data flows through (`toService`, `foldHeatmapRecords`,
 * `foldDetailMetrics`). Three benefits: (1) every derived number (per-service
 * token/request/error sums, canonical model labels, provider ids, cost) is
 * computed by the real logic instead of hand-typed and risking drift from it;
 * (2) raw model ids are grouped/labelled via this app's own
 * `canonicalizeModel`/`normalizeProvider` exactly like real telemetry, never a
 * hardcoded parallel label; (3) the heatmap cells, the AI-services catalog
 * rows, and the per-cell detail modal all fold from the SAME 13 seed rows, so
 * a service's total tokens in the catalog table always equals the sum of its
 * cells in the heatmap, and a cell's modal detail always equals the cell it
 * was opened from.
 *
 * The dataset: 6 AI services (checkout / support / docs-RAG / sales-outreach
 * / fraud-triage / internal-devtools) spanning 4 providers (Anthropic direct
 * + via Bedrock, OpenAI, Google, AWS Bedrock/Nova) across 7 raw model ids (6
 * canonical models — one, Claude Sonnet 4.6, deliberately has TWO raw variants
 * across two services, exercising the heatmap column's multi-raw-variant
 * grouping the same way Bedrock's demo data exercises its blended-rate
 * fallback), ~22.4k LLM requests, ~10.8M tokens, a ~1.0% fleet error rate
 * (just over the amber threshold — a realistic "worth a glance" fleet, not
 * all-green), ~123 logical (HTTP-200 payload-level) errors concentrated on
 * two services, and one 4-model service (support-copilot, including an
 * embedding call) to exercise the "multi-model" finding and the services
 * table's "+N" model-chip overflow. RAG is a separate, independent seed (3
 * vector stores) since retrieval spans aren't attributed to a service/model
 * pair in this app's data model.
 */

import { canonicalizeModel } from "../../detection/attributes";
import type { ServiceRecord } from "./parseAIServices";
import type { CellRecord } from "./foldHeatmap";
import type { RagRecord } from "./parseRag";
import type { DetailRow } from "./foldDetailMetrics";

const NS_PER_MS = 1_000_000;

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

interface DemoServiceDef {
  service: string;
  serviceId: string;
  framework?: string;
  agentNames: string[];
}

// `Record<ServiceKey, DemoServiceDef>` (a plain annotation, not `as const
// satisfies`) so every entry structurally widens to DemoServiceDef —
// `satisfies` alone would keep each entry's own narrower literal shape, and
// entries that omit the optional `framework` field would then fail to
// type-check `svc.framework` below.
const SERVICES: Record<
  "checkout" | "support" | "docsrag" | "sales" | "fraud" | "devtools",
  DemoServiceDef
> = {
  checkout: {
    service: "checkout-agent-svc",
    serviceId: "SERVICE-9F2A6B1C3D4E5F60",
    framework: "LangGraph",
    agentNames: ["checkout-planner", "checkout-executor"],
  },
  support: {
    service: "support-copilot-svc",
    // eslint-disable-next-line noSecrets/no-secrets -- fake demo dt.entity.service id, not a real credential
    serviceId: "SERVICE-4C7E1A8B2D3F9061",
    framework: "AgentExecutor",
    agentNames: ["support-triage", "support-responder", "support-escalator"],
  },
  docsrag: {
    service: "docs-rag-svc",
    // eslint-disable-next-line noSecrets/no-secrets -- fake demo dt.entity.service id, not a real credential
    serviceId: "SERVICE-1B3D5F7A9C2E4608",
    framework: "LangChain",
    agentNames: ["docs-retriever"],
  },
  sales: {
    service: "sales-outreach-svc",
    // eslint-disable-next-line noSecrets/no-secrets -- fake demo dt.entity.service id, not a real credential
    serviceId: "SERVICE-7A1C3E5F9B2D4066",
    agentNames: ["sales-drafter", "sales-qualifier"],
  },
  fraud: {
    service: "fraud-triage-svc",
    // eslint-disable-next-line noSecrets/no-secrets -- fake demo dt.entity.service id, not a real credential
    serviceId: "SERVICE-2D4F6081A3C5E709",
    framework: "RunnableSequence",
    agentNames: ["fraud-risk-scorer"],
  },
  devtools: {
    service: "internal-devtools-bot",
    serviceId: "SERVICE-8E0261B4D6F80A32",
    agentNames: ["devtools-bot"],
  },
};

type ServiceKey = keyof typeof SERVICES;
const SERVICE_KEYS = Object.keys(SERVICES) as ServiceKey[];

// ---------------------------------------------------------------------------
// Models — raw ids as they'd actually appear on gen_ai.request.model /
// gen_ai.provider.name. `sonnetDirect` and `sonnetBedrock` deliberately
// canonicalize to the SAME label ("Claude Sonnet 4.6") via different raw ids
// used by different services, so the heatmap column's `rawModels` list
// legitimately carries two variants (mirrors Bedrock demoData's Llama-pricing
// exercise, here for the canonicalization/grouping path instead).
// ---------------------------------------------------------------------------

const MODEL = {
  sonnetDirect: { raw: "claude-sonnet-4-6", system: "anthropic" },
  sonnetBedrock: {
    raw: "anthropic.claude-sonnet-4-6-20260112-v1:0",
    system: "bedrock",
  },
  haikuBedrock: {
    raw: "anthropic.claude-haiku-4-5-20251001-v1:0",
    system: "bedrock",
  },
  gpt4o: { raw: "gpt-4o", system: "openai" },
  geminiFlash: { raw: "gemini-2.5-flash", system: "google" },
  novaPro: { raw: "amazon.nova-pro-v1:0", system: "bedrock" },
  embeddingSmall: { raw: "text-embedding-3-small", system: "openai" },
} as const satisfies Record<string, { raw: string; system: string }>;

type ModelKey = keyof typeof MODEL;

// ---------------------------------------------------------------------------
// Seed cells — one row per (service, model) pair, shaped like what the
// heatmap / service-model-detail query builders in ./queries.ts return. THE
// single source of truth: every hook's demo constant below is derived from
// this array, so per-service and per-cell numbers always reconcile.
// ---------------------------------------------------------------------------

interface SeedCell {
  svc: ServiceKey;
  model: ModelKey;
  requests: number;
  inTok: number;
  outTok: number;
  errors: number;
  logicalErrors: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
}

const SEED_CELLS: SeedCell[] = [
  { svc: "checkout", model: "sonnetDirect", requests: 1840, inTok: 612_000, outTok: 1_305_000, errors: 15, logicalErrors: 0, p50Ms: 740, p90Ms: 1450, p95Ms: 2100 },
  { svc: "checkout", model: "haikuBedrock", requests: 960, inTok: 180_000, outTok: 210_000, errors: 10, logicalErrors: 0, p50Ms: 410, p90Ms: 780, p95Ms: 1100 },
  { svc: "support", model: "haikuBedrock", requests: 3200, inTok: 540_000, outTok: 760_000, errors: 64, logicalErrors: 96, p50Ms: 430, p90Ms: 820, p95Ms: 1250 },
  { svc: "support", model: "gpt4o", requests: 740, inTok: 310_000, outTok: 520_000, errors: 15, logicalErrors: 7, p50Ms: 980, p90Ms: 1800, p95Ms: 2600 },
  { svc: "support", model: "novaPro", requests: 1500, inTok: 95_000, outTok: 140_000, errors: 8, logicalErrors: 0, p50Ms: 260, p90Ms: 480, p95Ms: 650 },
  { svc: "support", model: "embeddingSmall", requests: 1800, inTok: 95_000, outTok: 0, errors: 0, logicalErrors: 0, p50Ms: 45, p90Ms: 80, p95Ms: 110 },
  { svc: "docsrag", model: "sonnetBedrock", requests: 2100, inTok: 980_000, outTok: 1_540_000, errors: 8, logicalErrors: 0, p50Ms: 690, p90Ms: 1320, p95Ms: 1900 },
  { svc: "docsrag", model: "geminiFlash", requests: 4300, inTok: 610_000, outTok: 380_000, errors: 26, logicalErrors: 0, p50Ms: 220, p90Ms: 410, p95Ms: 590 },
  { svc: "sales", model: "gpt4o", requests: 980, inTok: 410_000, outTok: 690_000, errors: 12, logicalErrors: 8, p50Ms: 1020, p90Ms: 1900, p95Ms: 2700 },
  { svc: "sales", model: "geminiFlash", requests: 2600, inTok: 340_000, outTok: 210_000, errors: 8, logicalErrors: 0, p50Ms: 240, p90Ms: 430, p95Ms: 610 },
  { svc: "fraud", model: "sonnetDirect", requests: 610, inTok: 205_000, outTok: 340_000, errors: 37, logicalErrors: 12, p50Ms: 810, p90Ms: 1600, p95Ms: 2300 },
  { svc: "fraud", model: "novaPro", requests: 1450, inTok: 88_000, outTok: 132_000, errors: 29, logicalErrors: 0, p50Ms: 270, p90Ms: 500, p95Ms: 680 },
  { svc: "devtools", model: "haikuBedrock", requests: 320, inTok: 42_000, outTok: 58_000, errors: 0, logicalErrors: 0, p50Ms: 390, p90Ms: 720, p95Ms: 980 },
];

// ---------------------------------------------------------------------------
// Heatmap (useExplorerHeatmap) — one CellRecord per seed row, fed through the
// real `foldHeatmapRecords` fold inside the hook (not pre-folded here, so the
// hook exercises the exact same code path for demo and real data).
// ---------------------------------------------------------------------------

export const DEMO_CELL_RECORDS: CellRecord[] = SEED_CELLS.map((c) => {
  const svc = SERVICES[c.svc];
  const model = MODEL[c.model];
  return {
    service: svc.service,
    service_id: svc.serviceId,
    model: model.raw,
    system: model.system,
    requests: c.requests,
    tokens: c.inTok + c.outTok,
  };
});

// ---------------------------------------------------------------------------
// AI services catalog (useAIServices) — per-service aggregate rows, mirroring
// the server-side `summarize ... by: { service }` buildAIServicesQuery would
// produce: every seed cell belonging to a service is summed here (the ONE
// piece of arithmetic this module does by hand, since that aggregation runs
// in DQL, not client-side TS) before being fed through the real `toService`
// parser inside the hook.
// ---------------------------------------------------------------------------

export const DEMO_SERVICE_RECORDS: ServiceRecord[] = SERVICE_KEYS.map((key) => {
  const svc = SERVICES[key];
  const cells = SEED_CELLS.filter((c) => c.svc === key);
  const requests = cells.reduce((s, c) => s + c.requests, 0);
  const inTok = cells.reduce((s, c) => s + c.inTok, 0);
  const outTok = cells.reduce((s, c) => s + c.outTok, 0);
  const errors = cells.reduce((s, c) => s + c.errors, 0);
  const logicalErrors = cells.reduce((s, c) => s + c.logicalErrors, 0);
  const models = Array.from(new Set(cells.map((c) => MODEL[c.model].raw)));
  return {
    service: svc.service,
    service_id: svc.serviceId,
    requests,
    tokens: inTok + outTok,
    in_tokens: inTok,
    out_tokens: outTok,
    errors,
    logical_errors: logicalErrors,
    agents: svc.agentNames.length,
    agent_names: [...svc.agentNames],
    models,
    framework: svc.framework,
    tok_per_req: requests > 0 ? (inTok + outTok) / requests : 0,
    error_rate_pct: requests > 0 ? (errors / requests) * 100 : 0,
  };
});

// ---------------------------------------------------------------------------
// Service × model detail modal (useServiceModelDetail) — keyed by
// `${service}::${canonicalModelLabel}` (the same key the hook derives from
// the clicked cell's service + `canonicalizeModel(representativeModel).label`
// at lookup time), one DetailRow per seed cell — the exact shape
// `buildServiceModelDetailQuery` returns, fed through the real
// `foldDetailMetrics` + `computeServiceModelCost` inside the hook.
// ---------------------------------------------------------------------------

export const DEMO_SERVICE_MODEL_DETAIL: Record<string, DetailRow> =
  Object.fromEntries(
    SEED_CELLS.map((c) => {
      const svc = SERVICES[c.svc];
      const model = MODEL[c.model];
      const label = canonicalizeModel(model.raw).label;
      const row: DetailRow = {
        requests: c.requests,
        in_tok: c.inTok,
        out_tok: c.outTok,
        errors: c.errors,
        logical_errors: c.logicalErrors,
        p50_ns: c.p50Ms * NS_PER_MS,
        p90_ns: c.p90Ms * NS_PER_MS,
        p95_ns: c.p95Ms * NS_PER_MS,
      };
      return [`${svc.service}::${label}`, row];
    }),
  );

// ---------------------------------------------------------------------------
// Retrieval (RAG) panel (useRag) — an independent seed: retrieval spans
// aren't attributed to a service/model pair in this app's data model (see
// RagPanel's doc comment), so this isn't derived from SEED_CELLS.
// ---------------------------------------------------------------------------

export const DEMO_RAG_RECORDS: RagRecord[] = [
  { system: "pinecone", queries: 2400, avg_top_k: 6.2 },
  { system: "qdrant", queries: 860, avg_top_k: 4.5 },
  { system: "weaviate", queries: 310, avg_top_k: 8 },
];
