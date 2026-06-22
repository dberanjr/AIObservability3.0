import { describe, it, expect } from "vitest";
import { buildServiceModelDetailQuery } from "./queries";
import {
  computeServiceModelCost,
  costTrioStats,
  isEstimatedCost,
  THIRTY_DAYS_MS,
  type ServiceModelCost,
} from "./serviceModelCost";
import { foldDetailMetrics } from "./foldDetailMetrics";
import {
  costOf,
  getPricing,
  UNKNOWN_PRICE,
  type ModelPricing,
} from "../../data/pricing";

describe("buildServiceModelDetailQuery", () => {
  const q = buildServiceModelDetailQuery(null, { from: "now()-2h" }, "svc-a", ["gpt-4o"]);

  it("fetches spans over the timeframe", () => {
    expect(q).toContain("fetch spans");
    expect(q).toContain("from: now()-2h");
    expect(q).toContain("to: now()");
  });

  it("matches the full raw-model list with an in(...) membership filter", () => {
    expect(q).toContain("in(gen_ai.request.model, array(");
    expect(q).toContain('"gpt-4o"');
  });

  it("includes every raw variant when the column folds multiple models", () => {
    const multi = buildServiceModelDetailQuery(
      null,
      { from: "now()-2h" },
      "svc-a",
      ["m1", "m2"],
    );
    expect(multi).toContain('in(gen_ai.request.model, array("m1", "m2"))');
  });

  it("filters to the service for this pair (same field the heatmap groups by)", () => {
    expect(q).toContain('entityName(dt.entity.service) == "svc-a"');
  });

  it("emits named summarize fields", () => {
    expect(q).toContain("requests = count()");
    expect(q).toContain("in_tok = sum(");
    expect(q).toContain("out_tok = sum(");
    expect(q).toContain("errors = countIf(");
    expect(q).toContain("logical_errors = countIf(");
    expect(q).toContain("p50_ns = percentile(duration, 50)");
    expect(q).toContain("p90_ns = percentile(duration, 90)");
    expect(q).toContain("p95_ns = percentile(duration, 95)");
  });

  it("coalesces in/out tokens like the heatmap query", () => {
    expect(q).toContain(
      "coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)",
    );
    expect(q).toContain(
      "coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0)",
    );
  });

  it("escapes embedded quotes in service/model values", () => {
    const dirty = buildServiceModelDetailQuery(
      null,
      { from: "now()-1h" },
      'sv"c',
      ['mo"del'],
    );
    expect(dirty).toContain('entityName(dt.entity.service) == "sv\\"c"');
    expect(dirty).toContain('in(gen_ai.request.model, array("mo\\"del"))');
  });
});

describe("computeServiceModelCost", () => {
  const DAY_MS = 24 * 3600 * 1000;
  const model = "gpt-4o"; // present in pricing table
  // 1M in, 1M out → costOf = inputPerMTok + outputPerMTok = 2.5 + 10 = 12.5
  const inTok = 1_000_000;
  const outTok = 1_000_000;

  it("actual matches costOf for the model", () => {
    const c = computeServiceModelCost({
      inTok,
      outTok,
      model,
      samplingRatio: 1,
      timeframeMs: DAY_MS,
    });
    expect(c.actual).toBeCloseTo(costOf(inTok, outTok, model), 10);
  });

  it("samplingRatio=1 → extrapolated == actual", () => {
    const c = computeServiceModelCost({
      inTok,
      outTok,
      model,
      samplingRatio: 1,
      timeframeMs: DAY_MS,
    });
    expect(c.extrapolated).toBeCloseTo(c.actual, 10);
  });

  it("samplingRatio=0.01 → extrapolated == actual * 100", () => {
    const c = computeServiceModelCost({
      inTok,
      outTok,
      model,
      samplingRatio: 0.01,
      timeframeMs: DAY_MS,
    });
    expect(c.extrapolated).toBeCloseTo(c.actual * 100, 6);
  });

  it("monthlyRunRate scales by 30d / timeframe (24h window → extrapolated * 30)", () => {
    const c = computeServiceModelCost({
      inTok,
      outTok,
      model,
      samplingRatio: 1,
      timeframeMs: DAY_MS,
    });
    expect(c.monthlyRunRate).toBeCloseTo(c.extrapolated * 30, 6);
    expect(THIRTY_DAYS_MS).toBe(30 * DAY_MS);
  });

  it("returns pricing from getPricing", () => {
    const c = computeServiceModelCost({
      inTok,
      outTok,
      model,
      samplingRatio: 1,
      timeframeMs: DAY_MS,
    });
    expect(c.pricing).toEqual(getPricing(model));
  });

  it("guards non-finite sampling ratio (<=0 → extrapolated == actual)", () => {
    const c = computeServiceModelCost({
      inTok,
      outTok,
      model,
      samplingRatio: 0,
      timeframeMs: DAY_MS,
    });
    expect(c.extrapolated).toBeCloseTo(c.actual, 10);
  });

  it("guards zero timeframe (monthlyRunRate == 0)", () => {
    const c = computeServiceModelCost({
      inTok,
      outTok,
      model,
      samplingRatio: 1,
      timeframeMs: 0,
    });
    expect(c.monthlyRunRate).toBe(0);
  });

  it("clamps non-finite token inputs to a finite cost", () => {
    const c = computeServiceModelCost({
      inTok: Number.NaN,
      outTok: Number.POSITIVE_INFINITY,
      model,
      samplingRatio: 1,
      timeframeMs: DAY_MS,
    });
    expect(Number.isFinite(c.actual)).toBe(true);
    expect(Number.isFinite(c.extrapolated)).toBe(true);
    expect(Number.isFinite(c.monthlyRunRate)).toBe(true);
  });
});

describe("foldDetailMetrics", () => {
  // The DQL SDK serialises `long` counts and `duration` percentiles as STRINGS
  // (only `double` token sums arrive as JS numbers). Before the toNum coercion
  // these string fields silently folded to 0 — the requests/latency/errors=0
  // golden-signals bug while cost/tokens rendered fine. Lock that in.
  it("coerces stringified long/duration fields to numbers", () => {
    const m = foldDetailMetrics({
      requests: "2309",
      in_tok: "767226",
      out_tok: "2133546",
      errors: "1",
      logical_errors: "147",
      p50_ns: "6210000000",
      p90_ns: "23780000000",
      p95_ns: "40240000000",
    });
    expect(m.requests).toBe(2309);
    expect(m.inTok).toBe(767226);
    expect(m.outTok).toBe(2133546);
    expect(m.errors).toBe(1);
    expect(m.logicalErrors).toBe(147);
    // ns → ms
    expect(m.p50Ms).toBe(6210);
    expect(m.p90Ms).toBe(23780);
    expect(m.p95Ms).toBe(40240);
    // 1 / 2309 * 100 ≈ 0.0433
    expect(m.errorRatePct).toBeCloseTo(0.0433, 3);
    // (767226 + 2133546) / 2309 > 0
    expect(m.tokensPerReq).toBeGreaterThan(0);
    expect(m.tokensPerReq).toBeCloseTo((767226 + 2133546) / 2309, 6);
  });

  it("folds missing/undefined fields to zeros (never NaN)", () => {
    const m = foldDetailMetrics({});
    for (const v of Object.values(m)) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBe(0);
    }
  });

  it("treats junk strings as zero rather than propagating NaN", () => {
    const m = foldDetailMetrics({
      requests: "not-a-number",
      in_tok: "",
      p90_ns: "abc",
    });
    expect(m.requests).toBe(0);
    expect(m.inTok).toBe(0);
    expect(m.p90Ms).toBe(0);
    expect(m.errorRatePct).toBe(0); // requests=0 → guarded
    expect(m.tokensPerReq).toBe(0); // requests=0 → guarded
  });
});

describe("isEstimatedCost", () => {
  const known: ModelPricing = getPricing("gpt-4o");

  it("false for a known model from the table", () => {
    expect(isEstimatedCost(known)).toBe(false);
  });

  it("true for the inert Unknown pricing", () => {
    expect(isEstimatedCost(UNKNOWN_PRICE)).toBe(true);
  });

  it("true when the pricing is flagged blended", () => {
    expect(isEstimatedCost({ ...known, blended: true })).toBe(true);
  });
});

describe("costTrioStats", () => {
  const base: ServiceModelCost = {
    actual: 10,
    extrapolated: 1000,
    monthlyRunRate: 30000,
    pricing: getPricing("gpt-4o"),
  };

  it("returns three figures in actual / estimated / monthly order", () => {
    const stats = costTrioStats(base, 1);
    expect(stats.map((s) => s.value)).toEqual([10, 1000, 30000]);
    expect(stats[0].label).toMatch(/actual/i);
    expect(stats[1].label).toMatch(/full population/i);
    expect(stats[2].label).toMatch(/run-rate/i);
  });

  it("omits the sampling sublabel when fraction is 1 (no sampling)", () => {
    const stats = costTrioStats(base, 1);
    expect(stats[1].sub).toBeUndefined();
  });

  it("notes the scale factor when sampled (fraction 0.01 → ×100)", () => {
    const stats = costTrioStats(base, 0.01);
    expect(stats[1].sub).toContain("×100");
  });

  it("always annotates the monthly run-rate projection window", () => {
    expect(costTrioStats(base, 1)[2].sub).toContain("30 days");
  });
});
