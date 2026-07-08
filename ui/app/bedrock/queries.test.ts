import { describe, expect, it } from "vitest";
import {
  bedrockLogBase, buildBedrockOverviewQuery, buildBedrockDailyCostQuery,
  buildAgentSessionsQuery, buildBedrockFacetsQuery,
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

describe("buildBedrockDailyCostQuery", () => {
  it("makes a per-day, per-model token timeseries", () => {
    const q = buildBedrockDailyCostQuery(scope);
    expect(q).toContain("makeTimeseries");
    expect(q).toContain("interval: 1d");
    expect(q).toContain("by:");
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
