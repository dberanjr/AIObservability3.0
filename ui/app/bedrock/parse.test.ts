import { describe, expect, it } from "vitest";
import { parseAccountCost, parseAgentSessions, parseOverview, parsePerfByModel } from "./parse";

describe("parseOverview", () => {
  it("maps a summarize-style record to OverviewTotals", () => {
    const totals = parseOverview([
      {
        invocations: 934, inTok: 1_600_000, outTok: 500_000,
        cacheRead: 100_000, cacheWrite: 0,
        accounts: 4, models: 12, sessions: 13, errors: 6,
      },
    ]);
    expect(totals).toEqual({
      invocations: 934, inTok: 1_600_000, outTok: 500_000,
      cacheRead: 100_000, cacheWrite: 0,
      accounts: 4, models: 12, sessions: 13, errors: 6,
    });
  });

  it("returns zeros for an empty result set", () => {
    expect(parseOverview([])).toEqual({
      invocations: 0, inTok: 0, outTok: 0,
      cacheRead: 0, cacheWrite: 0,
      accounts: 0, models: 0, sessions: 0, errors: 0,
    });
  });
});

describe("parseAgentSessions", () => {
  it("computes cost, cache% and error rate per session", () => {
    const rows = parseAgentSessions([
      { session: "apollo-agent-session", account: "975049911737",
        invocations: 100, inTok: 900_000, outTok: 100_000, cacheRead: 100_000, cacheWrite: 0,
        errors: 1, models: ["us.anthropic.claude-sonnet-4-6"] },
    ]);
    expect(rows[0].session).toBe("apollo-agent-session");
    expect(rows[0].estCost).toBeGreaterThan(0);
    expect(rows[0].errorRate).toBeCloseTo(0.01);
    expect(rows[0].cachePct).toBeCloseTo(10); // 100k / 1M input-side
  });
});

describe("parsePerfByModel", () => {
  it("reads latency arrays and derives a p95-ish scalar", () => {
    const rows = parsePerfByModel([
      { ModelId: "us.anthropic.claude-opus-4-8", latencyMs: [20000, 22506, 25000], ttftMs: [19964], invocations: [7] },
    ]);
    expect(rows[0].model).toBe("claude-opus-4-8");
    expect(rows[0].latencyMs).toBeGreaterThan(0);
  });
});

describe("parseAccountCost", () => {
  it("sums cost per account across its (account, modelId) rows and sorts desc", () => {
    const rows = parseAccountCost([
      { account: "111", modelId: "us.anthropic.claude-sonnet-4-6", inTok: 1_000_000, outTok: 0, cacheRead: 0, cacheWrite: 0 },
      { account: "111", modelId: "amazon.titan-text-express-v1", inTok: 1_000, outTok: 0, cacheRead: 0, cacheWrite: 0 },
      { account: "222", modelId: "us.anthropic.claude-sonnet-4-6", inTok: 100_000, outTok: 0, cacheRead: 0, cacheWrite: 0 },
    ]);
    expect(rows.map((r) => r.account)).toEqual(["111", "222"]);
    expect(rows[0].cost).toBeGreaterThan(rows[1].cost);
    // account "111" rolls up BOTH of its model rows (sonnet + titan), not just one.
    expect(rows[0].cost).toBeGreaterThan(3); // sonnet alone: 1M input tokens = $3
  });

  it("returns [] for an empty result set", () => {
    expect(parseAccountCost([])).toEqual([]);
  });

  it("flags an account blended when any of its rows used the fallback rate", () => {
    const rows = parseAccountCost([
      { account: "111", modelId: "totally-unpriced-model-xyz", inTok: 1_000, outTok: 0, cacheRead: 0, cacheWrite: 0 },
    ]);
    expect(rows[0].blended).toBe(true);
  });
});
