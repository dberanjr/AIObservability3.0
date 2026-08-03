import { describe, expect, it } from "vitest";
import {
  bedrockLogBase, buildBedrockOverviewQuery, buildBedrockDailyCostQuery,
  buildAgentSessionsQuery, buildBedrockFacetsQuery, bedrockCostIntervalSec,
  buildBedrockAvailableQuery,
} from "./queries";

const scope = { timeframe: { from: "now()-7d", to: "now()" }, accounts: [] as string[], models: [] as string[] };

describe("buildBedrockAvailableQuery", () => {
  it("scopes the existence probe to the PASSED timeframe, not a hardcoded window", () => {
    const q = buildBedrockAvailableQuery({ from: "now()-30d", to: "now()-7d" });
    expect(q).toContain("from: now()-30d, to: now()-7d");
    expect(q).not.toContain("now()-24h");
  });
  it("defaults `to` to now() when the timeframe is open-ended", () => {
    const q = buildBedrockAvailableQuery({ from: "now()-7d" });
    expect(q).toContain("from: now()-7d, to: now()");
  });
});

describe("bedrockLogBase", () => {
  it("filters the bedrock log group BEFORE the content match (scan pruning)", () => {
    const q = bedrockLogBase(scope);
    const gi = q.indexOf('dt.da.aws.log_group');
    const ci = q.indexOf('ModelInvocationLog');
    expect(gi).toBeGreaterThan(-1);
    expect(gi).toBeLessThan(ci);
    expect(q).toContain('parse content, "JSON:b"');
  });
  it("injects an account filter when accounts are selected", () => {
    const q = bedrockLogBase({ ...scope, accounts: ["975049911737", "637423486688"] });
    expect(q).toContain('in(b[accountId], array("975049911737","637423486688"))');
  });
});

describe("buildBedrockOverviewQuery", () => {
  it("aggregates invocations, tokens, accounts, models, sessions", () => {
    const q = buildBedrockOverviewQuery(scope);
    expect(q).toContain("summarize");
    expect(q).toContain("count()");
    expect(q).toContain("toLong(b[input][inputTokenCount])");
    expect(q).toContain("countDistinct(account)");
  });
});

describe("bedrockCostIntervalSec", () => {
  // The interval ladder is tuned to keep column count roughly ≤ 30–48 so bars
  // never overflow the container and axis labels stay readable: sub-day scopes
  // keep intraday shape, but anything ≥ ~4 days folds to DAILY buckets (a 7-day
  // scope → 7 columns, a 30-day scope → 30). A prior ladder used 1h buckets up
  // to 14 days, turning 7 days into 168 overflowing columns.
  // Expressed in SECONDS — DQL's `m` duration unit is ambiguous between minutes
  // and months, so the app never emits `1m`.
  it.each([
    ["now()-1h", 300],
    ["now()-2h", 300],
    ["now()-6h", 1800],
    ["now()-12h", 1800],
    ["now()-18h", 3600],
    ["now()-24h", 3600],
    ["now()-72h", 21600],
    ["now()-7d", 86400],
    ["now()-13d", 86400],
    ["now()-14d", 86400],
    ["now()-30d", 86400],
    ["now()-90d", 86400],
  ])("%s -> %i seconds", (from, expected) => {
    expect(bedrockCostIntervalSec(from)).toBe(expected);
  });
});

describe("buildBedrockDailyCostQuery", () => {
  it("makes a per-model token timeseries bucketed to the adaptive interval for a 24h scope (1h buckets)", () => {
    const q = buildBedrockDailyCostQuery({ ...scope, timeframe: { from: "now()-24h", to: "now()" } });
    expect(q).toContain("makeTimeseries");
    expect(q).toContain("interval: 3600s");
    expect(q).toContain("by:");
  });

  it("folds a 7-day scope to 1-day buckets (7 readable columns, no overflow)", () => {
    const q = buildBedrockDailyCostQuery(scope);
    expect(q).toContain("interval: 86400s");
  });

  it("narrows the bucket for a short (1h) scope instead of always using 1 day", () => {
    const q = buildBedrockDailyCostQuery({ ...scope, timeframe: { from: "now()-1h", to: "now()" } });
    expect(q).toContain("interval: 300s");
  });
});

describe("buildAgentSessionsQuery", () => {
  it("groups by identity session name, account, AND modelId — one row per model per session", () => {
    // One row per (session, account, modelId) lets parseAgentSessions price
    // each model at its own rate instead of pricing a whole multi-model
    // session at a single model's rate.
    const q = buildAgentSessionsQuery(scope);
    expect(q).toContain("arrayLast(splitString(b[identity][arn]");
    expect(q).toContain("by: { session, account, modelId }");
  });
});

describe("buildBedrockFacetsQuery", () => {
  it("collects distinct accounts and models, unfiltered by any current scope selection", () => {
    const q = buildBedrockFacetsQuery({ from: "now()-7d", to: "now()" });
    expect(q).toContain("collectDistinct(b[accountId])");
    expect(q).toContain("collectDistinct(b[modelId])");
    // Must NOT filter on accountId/modelId — that would make a picker's own
    // selection prune its own option list.
    expect(q).not.toContain("in(b[accountId]");
    expect(q).not.toContain("in(b[modelId]");
  });

  it("defaults to: now() when to is undefined", () => {
    const q = buildBedrockFacetsQuery({ from: "now()-7d" });
    expect(q).toContain("to: now()");
  });
});

describe("optional timeframe.to handling", () => {
  it("bedrockLogBase defaults to: now() when to is undefined", () => {
    const noToScope = { timeframe: { from: "now()-7d" }, accounts: [] as string[], models: [] as string[] };
    const q = bedrockLogBase(noToScope);
    expect(q).toContain("to: now()");
    expect(q).not.toContain("to: undefined");
  });
});
