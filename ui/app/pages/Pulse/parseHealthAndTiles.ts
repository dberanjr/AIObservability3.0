/**
 * Pure fold functions for two Pulse-exclusive hooks: `useHealthContributors`
 * (Platform Health drilldown) and `useTileBreakdowns` (Models/MCP donut
 * breakdowns in the summary tile row).
 *
 * Kept in a SEPARATE module from the hooks (mirrors `./parse.ts`, which does
 * the same for the 7 Summary-shared Pulse hooks) so both the real query path
 * and the Demo Mode path (`demoData.ts`) share the exact same math, AND so
 * this module stays free of React / useScopedDql — pulling those in here
 * would drag a DOM-dependent transitive chain into the pure-function test
 * runner (`vitest.config.ts` runs `environment: "node"`, no `document`).
 */

import { canonicalizeModel } from "../../detection/attributes";
import { costOf } from "../../data/pricing";
import { toNum } from "../../data/format";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

/* --------------------------- useHealthContributors ------------------------ */

export interface Contributor {
  name: string;
  p95Ms: number;
  calls: number;
  errorRatePct: number | null;
}

export interface HealthContributorsCore {
  slowAgents: Contributor[];
  slowModels: Contributor[];
  errorAgents: Contributor[];
}

export interface SlowAgentRow {
  name?: string;
  p95_ms?: number;
  calls?: number;
  errors?: number;
  error_rate_pct?: number;
}
export interface SlowModelRow {
  name?: string;
  p95_ms?: number;
  calls?: number;
}

/**
 * Pure fold: raw slow-agent / slow-model rows into `HealthContributorsCore`.
 * Both `useHealthContributors` (real rows) and `demoData.ts` (canned rows)
 * call this — the ONLY place this math lives.
 */
export const computeHealthContributors = (
  agentRecords: SlowAgentRow[],
  modelRecords: SlowModelRow[],
): HealthContributorsCore => {
  const agentRows: Contributor[] = agentRecords
    .filter((r) => typeof r.name === "string")
    .map((r) => ({
      name: r.name as string,
      p95Ms: num(r.p95_ms),
      calls: num(r.calls),
      errorRatePct: num(r.error_rate_pct),
    }));

  const modelRows: Contributor[] = modelRecords
    .filter((r) => typeof r.name === "string")
    .map((r) => ({
      name: canonicalizeModel(r.name as string).label,
      p95Ms: num(r.p95_ms),
      calls: num(r.calls),
      errorRatePct: null,
    }));

  const errorAgents = [...agentRows]
    .filter((a) => (a.errorRatePct ?? 0) > 0)
    .sort((a, b) => (b.errorRatePct ?? 0) - (a.errorRatePct ?? 0))
    .slice(0, 5);

  return { slowAgents: agentRows, slowModels: modelRows, errorAgents };
};

/* ----------------------------- useTileBreakdowns --------------------------- */

export interface BreakdownSlice {
  key: string;
  label: string;
  /** Primary metric used for donut sizing. */
  value: number;
  /** Total tokens (input + output). Always 0 for MCP slices. */
  tokens: number;
  /** Blended USD cost estimate. Always 0 for MCP slices. */
  cost: number;
  /** Average span duration ms. 0 for model slices. */
  avgDurationMs: number;
  /** Median (p50) span duration ms. */
  p50DurationMs: number;
  /** P95 span duration ms. */
  p95DurationMs: number;
  /** P99 span duration ms. */
  p99DurationMs: number;
  /** OTel span-level errors (span.status_code="error"). */
  spanErrors: number;
  /** Functional tool errors (isError present in response output). */
  toolErrors: number;
  /** Click-to-filter target for this slice's label. */
  filter?: { attribute: string; values: string[]; label?: string };
}

export interface TileBreakdownsCore {
  models: BreakdownSlice[];
  mcpServers: BreakdownSlice[];
  mcpTools: BreakdownSlice[];
}

export interface ModelRec {
  model?: string;
  requests?: number;
  input_tokens?: number;
  output_tokens?: number;
}
export interface ServerRec {
  server?: string;
  requests?: number;
  avg_ms?: number;
  p50_ms?: number;
  p95_ms?: number;
  p99_ms?: number;
  span_errors?: number;
  tool_errors?: number;
}
export interface ToolRec {
  tool?: string;
  calls?: number;
  avg_ms?: number;
  p50_ms?: number;
  p95_ms?: number;
  p99_ms?: number;
  span_errors?: number;
  tool_errors?: number;
}

interface ModelAgg {
  label: string;
  rawModels: Set<string>;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  pricingKey: string;
  domRequests: number;
}

/**
 * Pure fold: raw model/MCP-server/MCP-tool rows into a `TileBreakdownsCore`.
 * Both `useTileBreakdowns` (real rows) and `demoData.ts` (canned rows) call
 * this — the ONLY place this math lives.
 */
export const foldTileBreakdowns = (
  modelRecords: ModelRec[],
  serverRecords: ServerRec[],
  toolRecords: ToolRec[],
  samplingRatio: number,
): TileBreakdownsCore => {
  const modelAcc = new Map<string, ModelAgg>();
  for (const r of modelRecords) {
    if (typeof r.model !== "string" || !r.model) continue;
    const { key, label } = canonicalizeModel(r.model);
    const reqs = num(r.requests);
    const cur =
      modelAcc.get(key) ?? {
        label,
        rawModels: new Set<string>(),
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        pricingKey: r.model,
        domRequests: -1,
      };
    cur.rawModels.add(r.model);
    cur.requests += reqs * samplingRatio;
    cur.inputTokens += num(r.input_tokens) * samplingRatio;
    cur.outputTokens += num(r.output_tokens) * samplingRatio;
    if (reqs > cur.domRequests) {
      cur.domRequests = reqs;
      cur.pricingKey = r.model;
    }
    modelAcc.set(key, cur);
  }
  const models: BreakdownSlice[] = Array.from(modelAcc.entries())
    .map(([key, agg]) => {
      return {
        key,
        label: agg.label,
        value: agg.requests,
        tokens: agg.inputTokens + agg.outputTokens,
        cost: costOf(agg.inputTokens, agg.outputTokens, agg.pricingKey),
        avgDurationMs: 0,
        p50DurationMs: 0,
        p95DurationMs: 0,
        p99DurationMs: 0,
        spanErrors: 0,
        toolErrors: 0,
        filter: {
          attribute: "gen_ai.request.model",
          values: Array.from(agg.rawModels),
          label: "model",
        },
      };
    })
    .sort((a, b) => b.value - a.value);

  const mcpServers: BreakdownSlice[] = serverRecords
    .filter(
      (r): r is Required<Pick<ServerRec, "server">> & ServerRec =>
        typeof r.server === "string" && r.server.length > 0,
    )
    .map((r) => ({
      key: r.server,
      label: r.server,
      value: num(r.requests) * samplingRatio,
      tokens: 0,
      cost: 0,
      avgDurationMs: num(r.avg_ms),
      p50DurationMs: num(r.p50_ms),
      p95DurationMs: num(r.p95_ms),
      p99DurationMs: num(r.p99_ms),
      spanErrors: num(r.span_errors) * samplingRatio,
      toolErrors: num(r.tool_errors) * samplingRatio,
      filter: {
        attribute: "traceloop.workflow.name",
        values: [r.server],
        label: "MCP server",
      },
    }));

  const mcpTools: BreakdownSlice[] = toolRecords
    .filter(
      (r): r is Required<Pick<ToolRec, "tool">> & ToolRec =>
        typeof r.tool === "string" && r.tool.length > 0,
    )
    .map((r) => ({
      key: r.tool,
      label: r.tool,
      value: num(r.calls) * samplingRatio,
      tokens: 0,
      cost: 0,
      avgDurationMs: num(r.avg_ms),
      p50DurationMs: num(r.p50_ms),
      p95DurationMs: num(r.p95_ms),
      p99DurationMs: num(r.p99_ms),
      spanErrors: num(r.span_errors) * samplingRatio,
      toolErrors: num(r.tool_errors) * samplingRatio,
      filter: {
        attribute: "traceloop.entity.name",
        values: [r.tool],
        label: "MCP tool",
      },
    }));

  return { models, mcpServers, mcpTools };
};
