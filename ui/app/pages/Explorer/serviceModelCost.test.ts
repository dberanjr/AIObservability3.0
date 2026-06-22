import { describe, it, expect } from "vitest";
import { buildServiceModelDetailQuery } from "./queries";
import {
  computeServiceModelCost,
  THIRTY_DAYS_MS,
} from "./serviceModelCost";
import { costOf, getPricing } from "../../data/pricing";

describe("buildServiceModelDetailQuery", () => {
  const q = buildServiceModelDetailQuery(null, { from: "now()-2h" }, "svc-a", "gpt-4o");

  it("fetches spans over the timeframe", () => {
    expect(q).toContain("fetch spans");
    expect(q).toContain("from: now()-2h");
    expect(q).toContain("to: now()");
  });

  it("filters to the model for this pair", () => {
    expect(q).toContain('gen_ai.request.model == "gpt-4o"');
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
      'mo"del',
    );
    expect(dirty).toContain('entityName(dt.entity.service) == "sv\\"c"');
    expect(dirty).toContain('gen_ai.request.model == "mo\\"del"');
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
