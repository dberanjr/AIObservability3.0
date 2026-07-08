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
/** toNum, but NaN (e.g. a missing/undefined field on an empty result row)
 *  collapses to 0 — an overview total should read "0", never "NaN". */
const numOr0 = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export const parseOverview = (records: Record<string, unknown>[]): OverviewTotals => {
  const r = records[0] ?? {};
  return {
    invocations: numOr0(r.invocations), inTok: numOr0(r.inTok), outTok: numOr0(r.outTok),
    cacheRead: numOr0(r.cacheRead), cacheWrite: numOr0(r.cacheWrite),
    accounts: numOr0(r.accounts), models: numOr0(r.models),
    sessions: numOr0(r.sessions), errors: numOr0(r.errors),
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
      session: str(r.session), account: str(r.account),
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
    model: normalizeBedrockModelId(str(r.ModelId)),
    latencyMs: arrMax(numArr(r.latencyMs)),
    ttftMs: arrAvg(numArr(r.ttftMs)),
    invocations: numArr(r.invocations).reduce((s, x) => s + x, 0),
  }));

export interface AccountCostRow {
  account: string;
  cost: number;
  /** True if ANY model rolled into this account's total used the blended
   *  fallback rate (unpriced model) rather than the rate card. */
  blended: boolean;
}

/** Folds the (account, modelId) rows from `buildAccountModelQuery` — each a
 *  scalar `summarize` row, not a timeseries — into one cost total per
 *  account. Mirrors the per-row `bedrockCostOfTokens` call `parseAgentSessions`
 *  makes, summed by account instead of kept per-row, and sorted desc so a
 *  BarList can render it directly. */
export const parseAccountCost = (records: Record<string, unknown>[]): AccountCostRow[] => {
  const sums = new Map<string, { cost: number; blended: boolean }>();
  for (const r of records ?? []) {
    const account = str(r.account);
    const { cost, blended } = bedrockCostOfTokens({
      modelId: str(r.modelId),
      inTok: toNum(r.inTok),
      outTok: toNum(r.outTok),
      cacheRead: toNum(r.cacheRead),
      cacheWrite: toNum(r.cacheWrite),
    });
    const prev = sums.get(account) ?? { cost: 0, blended: false };
    sums.set(account, { cost: prev.cost + cost, blended: prev.blended || blended });
  }
  return [...sums.entries()]
    .map(([account, v]) => ({ account, cost: v.cost, blended: v.blended }))
    .sort((a, b) => b.cost - a.cost);
};
