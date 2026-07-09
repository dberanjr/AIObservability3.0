import { describe, expect, it } from "vitest";
import {
  buildTpmByModelQuery,
  buildPerModelSummaryQuery,
  parseTpmByModel,
  parseBands,
  parseLogDelivery,
  parsePerModelSummary,
} from "./runtimeMetrics";

const scope = { timeframe: { from: "now()-7d", to: "now()" }, accounts: [] as string[], models: [] as string[] };

describe("runtime metric builders", () => {
  it("adds an account filter clause only when accounts are selected", () => {
    expect(buildTpmByModelQuery(scope)).not.toContain("filter:");
    const scoped = buildTpmByModelQuery({ ...scope, accounts: ["975049911737"] });
    expect(scoped).toContain('filter: { in(aws.account.id, "975049911737") }');
  });
  it("does NOT apply a model filter to metric queries (log/metric ModelId vocab differs)", () => {
    const q = buildPerModelSummaryQuery({ ...scope, models: ["us.anthropic.claude-opus-4-8"] });
    expect(q).not.toContain("ModelId, \"us.anthropic");
  });
});

describe("parseTpmByModel", () => {
  it("shortens the model id and drops zero/negative peaks", () => {
    const rows = parseTpmByModel([
      { ModelId: "us.anthropic.claude-opus-4-8", peak: 172330 },
      { ModelId: "us.amazon.nova-2-lite-v1:0", peak: 0 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].peak).toBe(172330);
    expect(rows[0].rawModel).toBe("us.anthropic.claude-opus-4-8");
    expect(rows[0].model.length).toBeLessThan(rows[0].rawModel.length);
  });
});

describe("parseBands", () => {
  it("reads min/avg/max arrays from the single record", () => {
    const b = parseBands([{ min_ms: [1, 2], avg_ms: [3, 4], max_ms: [5, 6] }]);
    expect(b.min).toEqual([1, 2]);
    expect(b.max).toEqual([5, 6]);
  });
  it("returns empty arrays on no data", () => {
    expect(parseBands([]).avg).toEqual([]);
  });
});

describe("parseLogDelivery", () => {
  it("sums the delivered array into a total", () => {
    const d = parseLogDelivery([{ delivered: [100, 200, null, 328] }]);
    expect(d.total).toBe(628);
    expect(d.values).toEqual([100, 200, 0, 328]);
  });
});

describe("parsePerModelSummary", () => {
  it("coerces the scalar per-model fields", () => {
    const rows = parsePerModelSummary([
      { ModelId: "us.anthropic.claude-sonnet-4-6", invocations: "580", inTok: "1000", outTok: "500", cacheRead: "2948511", cacheWrite: "0", latencyMs: 6795.9, ttftMs: 5040.1 },
    ]);
    expect(rows[0].invocations).toBe(580);
    expect(rows[0].cacheRead).toBe(2948511);
    expect(rows[0].model).toContain("sonnet");
  });
});
