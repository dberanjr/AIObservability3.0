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

interface AgentSessionAccumulator {
  session: string; account: string;
  invocations: number; inTok: number; outTok: number;
  cacheRead: number; cacheWrite: number; errors: number;
  estCost: number; blended: boolean;
  /** Insertion-ordered so `models[0]` (the perf-join "primary" model — see
   *  agentSessionPerf.ts) stays the first model this session's rows produced,
   *  same as the old `collectDistinct` array's first entry. */
  models: Set<string>;
}

/** `buildAgentSessionsQuery` now returns one row per (session, account,
 *  modelId) instead of one row per session, so a multi-model agent session
 *  (e.g. Opus for planning + Nova for tool calls) can be priced correctly —
 *  each row at ITS OWN model's rate — instead of the whole session's tokens
 *  getting priced at a single (arbitrary) model's rate. This groups those
 *  rows back down to one `AgentSessionRow` per (session, account), summing
 *  token/invocation/error counts and the already-per-model-priced cost. */
export const parseAgentSessions = (records: Record<string, unknown>[]): AgentSessionRow[] => {
  const groups = new Map<string, AgentSessionAccumulator>();
  for (const r of records ?? []) {
    const session = str(r.session), account = str(r.account);
    const key = `${session} ${account}`;
    const modelId = str(r.modelId);
    const inTok = toNum(r.inTok), outTok = toNum(r.outTok);
    const cacheRead = toNum(r.cacheRead), cacheWrite = toNum(r.cacheWrite);
    const invocations = toNum(r.invocations);
    const errors = toNum(r.errors);
    const { cost, blended } = bedrockCostOfTokens({ modelId, inTok, outTok, cacheRead, cacheWrite });

    const g =
      groups.get(key) ??
      ({
        session, account,
        invocations: 0, inTok: 0, outTok: 0, cacheRead: 0, cacheWrite: 0, errors: 0,
        estCost: 0, blended: false, models: new Set<string>(),
      } satisfies AgentSessionAccumulator);
    g.invocations += invocations;
    g.inTok += inTok;
    g.outTok += outTok;
    g.cacheRead += cacheRead;
    g.cacheWrite += cacheWrite;
    g.errors += errors;
    g.estCost += cost;
    g.blended = g.blended || blended;
    if (modelId) g.models.add(shortModelName(modelId));
    groups.set(key, g);
  }

  return [...groups.values()].map((g) => {
    const inputSide = g.inTok + g.cacheRead;
    return {
      session: g.session, account: g.account,
      models: [...g.models],
      invocations: g.invocations, inTok: g.inTok, outTok: g.outTok,
      cachePct: inputSide > 0 ? (g.cacheRead / inputSide) * 100 : 0,
      estCost: g.estCost, blended: g.blended,
      errorRate: g.invocations > 0 ? g.errors / g.invocations : 0,
    };
  });
};

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

export interface BedrockFacets {
  /** Raw AWS account ids seen in scope over the timeframe. */
  accounts: string[];
  /** Raw modelId strings (NOT normalizeBedrockModelId-collapsed) — these are
   *  what `bedrockLogBase` filters `b[modelId]` against, so a facet value
   *  must round-trip straight into `BedrockScope.models`. */
  models: string[];
}

const strArr = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];

/** Parses the single-row `collectDistinct` result from the D6 facets query
 *  (see queries.ts) into sorted, deduped account/model lists. */
export const parseFacets = (records: Record<string, unknown>[]): BedrockFacets => {
  const r = records[0] ?? {};
  return {
    accounts: [...new Set(strArr(r.accounts))].sort(),
    models: [...new Set(strArr(r.models))].sort(),
  };
};
