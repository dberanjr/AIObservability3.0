import { describe, expect, it } from "vitest";
import {
  bedrockLogBase, buildBedrockOverviewQuery, buildBedrockDailyCostQuery,
  buildAgentSessionsQuery, buildBedrockFacetsQuery, bedrockCostIntervalSec,
} from "./queries";

const scope = { timeframe: { from: "now()-7d", to: "now()" }, accounts: [] as string[], models: [] as string[] };

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
  // The interval ladder: shortest scopes get minute-level resolution, the
  // longest get week-level, so the chart is never a single collapsed bucket
  // (sub-day scope) nor hundreds of hairline bars (multi-month scope).
  // Expressed in SECONDS — DQL's `m` duration unit is ambiguous between
  // minutes and months, so the app never emits `1m`.
  it.each([
    ["now()-1h", 60],
    ["now()-2h", 60],
    ["now()-6h", 300],
    ["now()-12h", 900],
    ["now()-18h", 1800],
    ["now()-24h", 3600],
    ["now()-72h", 3600],
    ["now()-7d", 86400],
    ["now()-30d", 86400],
    ["now()-90d", 604800],
  ])("%s -> %i seconds", (from, expected) => {
    expect(bedrockCostIntervalSec(from)).toBe(expected);
  });
});

describe("buildBedrockDailyCostQuery", () => {
  it("makes a per-model token timeseries bucketed to the adaptive interval for a wide (7d) scope", () => {
    const q = buildBedrockDailyCostQuery(scope);
    expect(q).toContain("makeTimeseries");
    expect(q).toContain("interval: 86400s");
    expect(q).toContain("by:");
  });

  it("narrows the bucket for a short (1h) scope instead of always using 1 day", () => {
    const q = buildBedrockDailyCostQuery({ ...scope, timeframe: { from: "now()-1h", to: "now()" } });
    expect(q).toContain("interval: 60s");
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
