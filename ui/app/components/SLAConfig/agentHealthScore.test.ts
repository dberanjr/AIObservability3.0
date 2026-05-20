import { describe, expect, it } from "vitest";
import { agentHealthScore } from "./agentHealthScore";
import { EMPTY_THRESHOLDS, type SLAThresholds } from "./types";

const baseAgent = {
  p90Ms: 800,
  p99Ms: 1200,
  errorRatePct: 0.5,
  costPerInvocation: 0.001,
};

const allThresholds: SLAThresholds = {
  p90Ms: 1000,
  p99Ms: 1500,
  maxErrorRatePct: 1,
  maxCostPerInvocation: 0.005,
  maxTtftMs: null,
};

describe("agentHealthScore", () => {
  it("returns 100 / healthy when no thresholds are configured", () => {
    const result = agentHealthScore(baseAgent, EMPTY_THRESHOLDS);
    expect(result.score).toBe(100);
    expect(result.status).toBe("healthy");
    expect(result.breaches).toEqual([]);
  });

  it("returns 100 / healthy when metrics are under every threshold", () => {
    const result = agentHealthScore(baseAgent, allThresholds);
    expect(result.score).toBe(100);
    expect(result.status).toBe("healthy");
  });

  it("deducts 35 for a P90 breach", () => {
    const result = agentHealthScore(
      { ...baseAgent, p90Ms: 2000 },
      allThresholds,
    );
    expect(result.score).toBe(65);
    expect(result.status).toBe("warning");
    expect(result.breaches[0]).toMatch(/P90/);
  });

  it("deducts 25 for a P99 breach", () => {
    const result = agentHealthScore(
      { ...baseAgent, p99Ms: 2000 },
      allThresholds,
    );
    expect(result.score).toBe(75);
    expect(result.status).toBe("warning");
    expect(result.breaches[0]).toMatch(/P99/);
  });

  it("deducts 25 for an error-rate breach", () => {
    const result = agentHealthScore(
      { ...baseAgent, errorRatePct: 5 },
      allThresholds,
    );
    expect(result.score).toBe(75);
    expect(result.status).toBe("warning");
    expect(result.breaches[0]).toMatch(/Error rate/);
  });

  it("deducts 15 for a cost-per-invocation breach", () => {
    const result = agentHealthScore(
      { ...baseAgent, costPerInvocation: 0.01 },
      allThresholds,
    );
    expect(result.score).toBe(85);
    expect(result.status).toBe("warning");
    expect(result.breaches[0]).toMatch(/Cost\/invocation/);
  });

  it("stacks penalties when multiple thresholds breach", () => {
    const result = agentHealthScore(
      {
        p90Ms: 2000,
        p99Ms: 2000,
        errorRatePct: 5,
        costPerInvocation: 0.01,
      },
      allThresholds,
    );
    // 100 - 35 - 25 - 25 - 15 = 0
    expect(result.score).toBe(0);
    expect(result.status).toBe("breached");
    expect(result.breaches.length).toBe(4);
  });

  it("floors the score at 0 even when penalties exceed 100", () => {
    const result = agentHealthScore(
      {
        p90Ms: 10_000,
        p99Ms: 15_000,
        errorRatePct: 100,
        costPerInvocation: 99,
      },
      allThresholds,
    );
    expect(result.score).toBe(0);
    expect(result.status).toBe("breached");
  });

  it("status transitions: healthy at 100, warning at 65, breached below 60", () => {
    const at100 = agentHealthScore(baseAgent, EMPTY_THRESHOLDS);
    expect(at100.status).toBe("healthy");

    const at65 = agentHealthScore(
      { ...baseAgent, p90Ms: 2000 },
      allThresholds,
    );
    expect(at65.score).toBe(65);
    expect(at65.status).toBe("warning");

    const breached = agentHealthScore(
      { p90Ms: 2000, p99Ms: 2000, errorRatePct: 5, costPerInvocation: 0.01 },
      allThresholds,
    );
    expect(breached.score).toBe(0);
    expect(breached.status).toBe("breached");
  });

  it("ignores a metric whose threshold is null", () => {
    const result = agentHealthScore(
      { ...baseAgent, p90Ms: 99_999 },
      { ...allThresholds, p90Ms: null },
    );
    expect(result.score).toBe(100);
    expect(result.breaches).toEqual([]);
  });
});
