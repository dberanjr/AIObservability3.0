import { toNum } from "../data/format";
import type { Timeframe } from "../scope/types";
import { buildGuardrailSummaryQuery, buildGuardrailTrendQuery } from "./queries";
import { shortGuardrailId, type GuardrailRow } from "./guardrailsLogic";

/** Safe string coercion for a DQL record field (dimensions are strings). */
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * A guardrail data source. AWS Bedrock is the only one wired today; the others
 * are registered but dormant so the roadmap is visible and a new source lights
 * up by flipping `available` and supplying queries + a row parser — no UI change.
 * A friendly-name resolver seam (`nameFor`) is left for when a Smartscape /
 * entity name source is found (guardrail names aren't queryable via DQL today).
 */
export interface GuardrailProvider {
  id: string;
  label: string;
  cloud: "aws" | "azure" | "gcp" | "otel";
  /** True when data queries are wired; dormant stubs are false. */
  available: boolean;
  summaryQuery?: (tf: Timeframe) => string;
  trendQuery?: (tf: Timeframe) => string;
  parseRows?: (records: Record<string, unknown>[]) => GuardrailRow[];
  /** Optional display-name resolver (seam for future entity/Smartscape names). */
  nameFor?: (row: GuardrailRow) => string;
}

const awsBedrock: GuardrailProvider = {
  id: "aws-bedrock",
  label: "AWS Bedrock Guardrails",
  cloud: "aws",
  available: true,
  summaryQuery: buildGuardrailSummaryQuery,
  trendQuery: buildGuardrailTrendQuery,
  parseRows: (records) =>
    (records ?? []).map((r) => {
      const arn = str(r.GuardrailArn);
      return {
        arn,
        guardrailId: shortGuardrailId(arn),
        region: str(r.region),
        account: str(r.account),
        invocations: toNum(r.total_inv),
        intervened: toNum(r.total_intervened),
        interventionRate: toNum(r.intervention_rate),
        avgLatencyMs: toNum(r.avg_latency),
        textUnits: toNum(r.total_text),
      };
    }),
};

// Dormant — no data in this tenant. Wiring: set available:true + add queries/parser.
const azureContentSafety: GuardrailProvider = {
  id: "azure-content-safety",
  label: "Azure AI Content Safety",
  cloud: "azure",
  available: false,
};
const gcpModelArmor: GuardrailProvider = {
  id: "gcp-model-armor",
  label: "GCP Model Armor",
  cloud: "gcp",
  available: false,
};
const otelSpanGuardrails: GuardrailProvider = {
  id: "otel-span",
  label: "OpenTelemetry guardrail spans",
  cloud: "otel",
  available: false,
};

export const GUARDRAIL_PROVIDERS: GuardrailProvider[] = [
  awsBedrock,
  azureContentSafety,
  gcpModelArmor,
  otelSpanGuardrails,
];

export const activeGuardrailProviders = (): GuardrailProvider[] =>
  GUARDRAIL_PROVIDERS.filter((p) => p.available);
