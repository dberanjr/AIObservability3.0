import { toNum } from "../data/format";
import { bedrockCostOfTokens } from "./cost";
import { normalizeBedrockModelId, shortModelName } from "./model";

const numArr = (v: unknown): number[] =>
  Array.isArray(v) ? v.map((x) => (x == null ? 0 : toNum(x))) : [];
const arrAvg = (a: number[]): number => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const arrMax = (a: number[]): number => (a.length ? Math.max(...a) : 0);

export interface OverviewTotals {
  invocations: number; inTok: number; outTok: number;
  cacheRead: number; cacheWrite: number;
  accounts: number; models: number; sessions: number; errors: number;
}
export const parseOverview = (records: Record<string, unknown>[]): OverviewTotals => {
  const r = records[0] ?? {};
  return {
    invocations: toNum(r.invocations), inTok: toNum(r.inTok), outTok: toNum(r.outTok),
    cacheRead: toNum(r.cacheRead), cacheWrite: toNum(r.cacheWrite),
    accounts: toNum(r.accounts), models: toNum(r.models),
    sessions: toNum(r.sessions), errors: toNum(r.errors),
  };
};

export interface AgentSessionRow {
  session: string; account: string; models: string[];
  invocations: number; inTok: number; outTok: number;
  cachePct: number; estCost: number; blended: boolean; errorRate: number;
}
export const parseAgentSessions = (records: Record<string, unknown>[]): AgentSessionRow[] =>
  (records ?? []).map((r) => {
    const inTok = toNum(r.inTok), outTok = toNum(r.outTok);
    const cacheRead = toNum(r.cacheRead), cacheWrite = toNum(r.cacheWrite);
    const models = Array.isArray(r.models) ? (r.models as string[]) : [];
    const primary = models[0] ?? "";
    const { cost, blended } = bedrockCostOfTokens({ modelId: primary, inTok, outTok, cacheRead, cacheWrite });
    const inputSide = inTok + cacheRead;
    const invocations = toNum(r.invocations);
    return {
      session: String(r.session ?? ""), account: String(r.account ?? ""),
      models: models.map(shortModelName),
      invocations, inTok, outTok,
      cachePct: inputSide > 0 ? (cacheRead / inputSide) * 100 : 0,
      estCost: cost, blended,
      errorRate: invocations > 0 ? toNum(r.errors) / invocations : 0,
    };
  });

export interface PerfByModelRow {
  model: string; latencyMs: number; ttftMs: number; invocations: number;
}
export const parsePerfByModel = (records: Record<string, unknown>[]): PerfByModelRow[] =>
  (records ?? []).map((r) => ({
    model: normalizeBedrockModelId(String(r.ModelId ?? "")),
    latencyMs: arrMax(numArr(r.latencyMs)),
    ttftMs: arrAvg(numArr(r.ttftMs)),
    invocations: numArr(r.invocations).reduce((s, x) => s + x, 0),
  }));
