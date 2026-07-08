import { describe, expect, it } from "vitest";
import { parseAgentSessions, parsePerfByModel } from "./parse";

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
