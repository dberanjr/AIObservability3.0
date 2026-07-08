import { describe, expect, it } from "vitest";
import { computeInsights, buildInsightsInput } from "./insights";

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
    expect(concentration?.category).toBe("Cost concentration");
    expect(concentration?.entity).toBe("claude-opus-4-8");
    expect(concentration?.metric).toBe("48% of spend");

    const latency = insights.find((i) => /slower/i.test(i.text));
    expect(latency?.tone).toBe("info");
    expect(latency?.text).toContain("claude-opus-4-8");
    expect(latency?.text).toContain("22.5s");
    expect(latency?.text).toContain("5.8s");
    expect(latency?.category).toBe("Latency outlier");
    expect(latency?.entity).toBe("claude-opus-4-8");
    expect(latency?.metric).toMatch(/^~\d+× slower$/);
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
    expect(cache?.category).toBe("Cache savings");
    expect(cache?.entity).toBe("Prompt caching");
    expect(cache?.metric).toBe("$20.0");
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

describe("buildInsightsInput", () => {
  it("sums daily.byModel into costByModel, re-keyed through normalizeBedrockModelId", () => {
    const input = buildInsightsInput({
      daily: [
        { day: "2026-07-01", byModel: { "claude-sonnet-4-6": 10 }, actual: 10, savedByCache: 0 },
        { day: "2026-07-02", byModel: { "claude-sonnet-4-6": 15 }, actual: 15, savedByCache: 0 },
      ],
      summary: { total: 25, priced: 25, estimated: 0, savedByCache: 0, estimatedModels: [] },
      perfRows: [{ model: "claude-sonnet-4-6", latencyMs: 1000, ttftMs: 500, invocations: 9 }],
    });
    expect(input.costByModel).toEqual({ "claude-sonnet-4-6": 25 });
    expect(input.invocationsByModel).toEqual({ "claude-sonnet-4-6": 9 });
    expect(input.summary.total).toBe(25);
    expect(input.perf).toHaveLength(1);
  });

  it("re-keys a dated/versioned model id so it lines up with perfRows' normalized key", () => {
    const input = buildInsightsInput({
      daily: [
        {
          day: "2026-07-01",
          byModel: { "claude-3-5-sonnet-20241022-v2:0": 40 },
          actual: 40,
          savedByCache: 0,
        },
      ],
      summary: { total: 40, priced: 40, estimated: 0, savedByCache: 0, estimatedModels: [] },
      perfRows: [{ model: "claude-3-5-sonnet", latencyMs: 1000, ttftMs: 500, invocations: 5 }],
    });
    // Both sides must resolve to the SAME key for the cost-concentration
    // insight to find a matching invocation count.
    expect(Object.keys(input.costByModel)).toEqual(Object.keys(input.invocationsByModel));
  });

  it("returns empty maps for empty input", () => {
    const input = buildInsightsInput({
      daily: [],
      summary: { total: 0, priced: 0, estimated: 0, savedByCache: 0, estimatedModels: [] },
      perfRows: [],
    });
    expect(input.costByModel).toEqual({});
    expect(input.invocationsByModel).toEqual({});
    expect(input.perf).toEqual([]);
  });
});
