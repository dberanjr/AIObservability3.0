import { describe, expect, it } from "vitest";
import {
  DEMO_TOTAL_REQUESTS,
  DEMO_TOTAL_TOKENS,
  DEMO_PULSE_SUMMARY,
  DEMO_PULSE_HEALTH,
  DEMO_DAILY_SPEND,
  DEMO_TOKEN_EFFICIENCY,
  DEMO_PROVIDER_MIX,
  DEMO_AGENT_COSTS,
  DEMO_ACTIVITY_HISTOGRAM,
} from "./demoData";

// This asserts the folded demo constants (each built by piping a small raw
// fixture through the SAME `compute*` fold in `./parse` real data flows
// through — see demoData.ts) are internally consistent with each other and
// produce sane, finite output. Mirrors ui/app/bedrock/demoData.test.ts's
// pattern.

describe("Pulse demo dataset", () => {
  it("usePulseSummary: fleet totals are positive and finite", () => {
    expect(DEMO_PULSE_SUMMARY.tokens).toBe(DEMO_TOTAL_TOKENS);
    expect(DEMO_PULSE_SUMMARY.requests).toBe(DEMO_TOTAL_REQUESTS);
    expect(DEMO_PULSE_SUMMARY.spend).toBeGreaterThan(0);
    expect(DEMO_PULSE_SUMMARY.p95Ms).toBe(2100);
    expect(DEMO_PULSE_SUMMARY.spark.tokens.length).toBeGreaterThan(0);
    // Bucketed spark tokens should sum back (within rounding) to the total.
    const sparkSum = DEMO_PULSE_SUMMARY.spark.tokens.reduce((a, b) => a + b, 0);
    expect(sparkSum).toBeCloseTo(DEMO_TOTAL_TOKENS, -2);
  });

  it("usePulseHealth: all three pillars score in range and read healthy", () => {
    const { operational, quality, cost } = DEMO_PULSE_HEALTH;
    for (const pillar of [operational, quality, cost]) {
      expect(pillar.score).not.toBeNull();
      expect(pillar.score as number).toBeGreaterThanOrEqual(0);
      expect(pillar.score as number).toBeLessThanOrEqual(100);
    }
    expect(operational.status).toBe("good");
  });

  it("useDailySpend: 8 days folded, positive 7d spend", () => {
    expect(DEMO_DAILY_SPEND.bars.length).toBe(8);
    expect(DEMO_DAILY_SPEND.spend7d).toBeGreaterThan(0);
    expect(DEMO_DAILY_SPEND.spend24h).toBeGreaterThan(0);
    expect(DEMO_DAILY_SPEND.projected30d).toBeGreaterThan(DEMO_DAILY_SPEND.spend7d);
  });

  it("useTokenEfficiency: score is measured and eval coverage is present", () => {
    expect(DEMO_TOKEN_EFFICIENCY.score).not.toBeNull();
    expect(DEMO_TOKEN_EFFICIENCY.hasEval).toBe(true);
    expect(DEMO_TOKEN_EFFICIENCY.outputPerDollar).not.toBeNull();
  });

  it("useProviderMix: 4 known providers, one exercising the Bedrock-proxy flag", () => {
    expect(DEMO_PROVIDER_MIX.shares.length).toBe(4);
    expect(DEMO_PROVIDER_MIX.totalRequests).toBeCloseTo(DEMO_TOTAL_REQUESTS, 0);
    expect(DEMO_PROVIDER_MIX.shares.some((s) => s.isBedrockProxy)).toBe(true);
    const totalShare = DEMO_PROVIDER_MIX.shares.reduce((a, s) => a + s.sharePct, 0);
    expect(totalShare).toBeCloseTo(100, 0);
  });

  it("useAgentCosts: every demo agent carries a positive cost", () => {
    expect(DEMO_AGENT_COSTS.rows.length).toBe(5);
    for (const row of DEMO_AGENT_COSTS.rows) expect(row.cost).toBeGreaterThan(0);
    expect(DEMO_AGENT_COSTS.totalCost).toBeGreaterThan(0);
  });

  it("useActivityHistogram: 24 buckets summing to the fleet request total", () => {
    expect(DEMO_ACTIVITY_HISTOGRAM.buckets.length).toBe(24);
    expect(DEMO_ACTIVITY_HISTOGRAM.peakHour).not.toBeNull();
    const total = DEMO_ACTIVITY_HISTOGRAM.buckets.reduce((a, b) => a + b.requests, 0);
    expect(total).toBeCloseTo(DEMO_TOTAL_REQUESTS, -1);
  });
});
