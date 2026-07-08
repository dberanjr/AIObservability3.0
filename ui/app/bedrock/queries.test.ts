import { describe, expect, it } from "vitest";
import {
  bedrockLogBase, buildBedrockOverviewQuery, buildBedrockDailyCostQuery,
  buildAgentSessionsQuery,
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
  it("groups by identity session name and account", () => {
    const q = buildAgentSessionsQuery(scope);
    expect(q).toContain("arrayLast(splitString(b[identity][arn]");
    expect(q).toContain("by:");
  });
});
