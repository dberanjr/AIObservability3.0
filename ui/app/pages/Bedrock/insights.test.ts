import { describe, expect, it } from "vitest";
import { computeInsights } from "./insights";

describe("computeInsights", () => {
  it("flags model cost concentration and a latency outlier", () => {
    const insights = computeInsights({
      summary: { total: 100, priced: 100, estimated: 0, savedByCache: 20, estimatedModels: [] },
      costByModel: { "claude-opus-4-8": 48, "claude-sonnet-4-6": 31 },
      invocationsByModel: { "claude-opus-4-8": 7, "claude-sonnet-4-6": 49 },
      perf: [
        { model: "claude-opus-4-8", latencyMs: 22500, ttftMs: 20000, invocations: 7 },
        { model: "claude-sonnet-4-6", latencyMs: 5800, ttftMs: 4400, invocations: 49 },
      ],
    });
    expect(insights.some((i) => /concentration|% of spend/i.test(i.text))).toBe(true);
    expect(insights.some((i) => /slower|latency|p95/i.test(i.text))).toBe(true);

    const concentration = insights.find((i) => /% of spend/i.test(i.text));
    expect(concentration?.tone).toBe("warn");
    expect(concentration?.text).toContain("claude-opus-4-8");
    expect(concentration?.text).toContain("48%");

    const latency = insights.find((i) => /slower/i.test(i.text));
    expect(latency?.tone).toBe("info");
    expect(latency?.text).toContain("claude-opus-4-8");
    expect(latency?.text).toContain("22.5s");
    expect(latency?.text).toContain("5.8s");
  });

  it("flags cache savings when the saved share clears the threshold", () => {
    const insights = computeInsights({
      summary: { total: 100, priced: 100, estimated: 0, savedByCache: 20, estimatedModels: [] },
      costByModel: { "claude-sonnet-4-6": 100 },
      invocationsByModel: { "claude-sonnet-4-6": 10 },
      perf: [{ model: "claude-sonnet-4-6", latencyMs: 1000, ttftMs: 500, invocations: 10 }],
    });
    const cache = insights.find((i) => /cach/i.test(i.text));
    expect(cache?.tone).toBe("good");
    expect(cache?.text).toContain("20%");
  });

  it("does not flag concentration or cache savings below their thresholds", () => {
    const insights = computeInsights({
      summary: { total: 100, priced: 100, estimated: 0, savedByCache: 2, estimatedModels: [] },
      costByModel: { "claude-sonnet-4-6": 35, "claude-haiku-4-5": 35, "nova-pro": 30 },
      invocationsByModel: { "claude-sonnet-4-6": 40, "claude-haiku-4-5": 40, "nova-pro": 20 },
      perf: [
        { model: "claude-sonnet-4-6", latencyMs: 1000, ttftMs: 500, invocations: 40 },
        { model: "claude-haiku-4-5", latencyMs: 1100, ttftMs: 500, invocations: 40 },
        { model: "nova-pro", latencyMs: 1200, ttftMs: 500, invocations: 20 },
      ],
    });
    expect(insights.some((i) => /% of spend/i.test(i.text))).toBe(false);
    expect(insights.some((i) => /cach/i.test(i.text))).toBe(false);
    expect(insights.some((i) => /slower/i.test(i.text))).toBe(false);
    expect(insights).toEqual([]);
  });

  it("guards every division against empty input", () => {
    expect(
      computeInsights({
        summary: { total: 0, priced: 0, estimated: 0, savedByCache: 0, estimatedModels: [] },
        costByModel: {},
        invocationsByModel: {},
        perf: [],
      }),
    ).toEqual([]);
  });

  it("caps output at 3 sentences even when every threshold is cleared", () => {
    const insights = computeInsights({
      summary: { total: 100, priced: 100, estimated: 0, savedByCache: 20, estimatedModels: [] },
      costByModel: { "claude-opus-4-8": 48, "claude-sonnet-4-6": 31, "nova-lite": 21 },
      invocationsByModel: { "claude-opus-4-8": 7, "claude-sonnet-4-6": 49, "nova-lite": 44 },
      perf: [
        { model: "claude-opus-4-8", latencyMs: 22500, ttftMs: 20000, invocations: 7 },
        { model: "claude-sonnet-4-6", latencyMs: 5800, ttftMs: 4400, invocations: 49 },
        { model: "nova-lite", latencyMs: 900, ttftMs: 300, invocations: 44 },
      ],
    });
    expect(insights.length).toBeLessThanOrEqual(3);
  });
});
