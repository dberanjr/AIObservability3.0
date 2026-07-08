import { describe, expect, it } from "vitest";
import { parseAgentSessions, parseOverview, parsePerfByModel } from "./parse";

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
