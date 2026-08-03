import { describe, expect, it } from "vitest";
import {
  DEMO_MODEL_RECORDS,
  DEMO_DAILY_RECORDS,
  DEMO_SERVICE_COST_RECORDS,
  DEMO_CACHE_COST_RECORD,
  DEMO_SERVICES,
} from "./demoData";
import { inferModelType } from "./finopsLogic";
import { getPricing, resolveModelPricing, costOf } from "../../data/pricing";

describe("Models demo dataset", () => {
  it("has a non-empty set of raw model records, each with a positive request count", () => {
    expect(DEMO_MODEL_RECORDS.length).toBeGreaterThan(0);
    for (const r of DEMO_MODEL_RECORDS) {
      expect(r.model).toBeTruthy();
      expect(r.requests ?? 0).toBeGreaterThan(0);
      expect(Number.isFinite(r.input_tokens)).toBe(true);
      expect(Number.isFinite(r.output_tokens)).toBe(true);
    }
  });

  it("covers all three model types (generative, embedding, reranking)", () => {
    const types = new Set(
      DEMO_MODEL_RECORDS.map((r) => inferModelType(r.model ?? "", r.operation)),
    );
    expect(types.has("generative")).toBe(true);
    expect(types.has("embedding")).toBe(true);
    expect(types.has("reranking")).toBe(true);
  });

  it("includes at least one model deliberately absent from the pricing table (blended-rate badge)", () => {
    const unpriced = DEMO_MODEL_RECORDS.filter((r) => {
      const p = getPricing(r.model);
      return p.inputPerMTok === 0 && p.outputPerMTok === 0;
    });
    expect(unpriced.length).toBeGreaterThan(0);
    // resolveModelPricing/costOf still price it via the blended fallback —
    // never a silent $0 — exactly like every other cost figure on the page.
    for (const r of unpriced) {
      const pricing = resolveModelPricing(r.model);
      expect(pricing.blended).toBe(true);
      const cost = costOf(r.input_tokens ?? 0, r.output_tokens ?? 0, r.model);
      expect(cost).toBeGreaterThan(0);
    }
  });

  it("priced models resolve to a non-blended rate", () => {
    const priced = DEMO_MODEL_RECORDS.filter((r) => {
      const p = getPricing(r.model);
      return p.inputPerMTok > 0 || p.outputPerMTok > 0;
    });
    expect(priced.length).toBeGreaterThan(0);
    for (const r of priced) {
      expect(resolveModelPricing(r.model).blended).toBeUndefined();
    }
  });

  it("daily records: 7 day-offset buckets, each summing back to the model's total tokens", () => {
    expect(DEMO_DAILY_RECORDS.length).toBe(7);
    const totalsByModel = new Map<string, { in: number; out: number }>();
    for (const r of DEMO_MODEL_RECORDS) {
      if (!r.model) continue;
      totalsByModel.set(r.model, {
        in: r.input_tokens ?? 0,
        out: r.output_tokens ?? 0,
      });
    }
    const summedByModel = new Map<string, { in: number; out: number }>();
    for (const day of DEMO_DAILY_RECORDS) {
      for (const r of day) {
        if (!r.model) continue;
        const acc = summedByModel.get(r.model) ?? { in: 0, out: 0 };
        acc.in += r.input_tokens ?? 0;
        acc.out += r.output_tokens ?? 0;
        summedByModel.set(r.model, acc);
      }
    }
    for (const [model, totals] of totalsByModel.entries()) {
      const summed = summedByModel.get(model);
      expect(summed).toBeDefined();
      expect(summed!.in).toBe(totals.in);
      expect(summed!.out).toBe(totals.out);
    }
  });

  it("per-service breakdown reconciles (within rounding) to each model's total tokens, and covers every demo service", () => {
    const totalsByModel = new Map<string, number>();
    for (const r of DEMO_MODEL_RECORDS) {
      if (!r.model) continue;
      totalsByModel.set(r.model, (r.input_tokens ?? 0) + (r.output_tokens ?? 0));
    }
    const summedByModel = new Map<string, number>();
    const seenServices = new Set<string>();
    for (const r of DEMO_SERVICE_COST_RECORDS) {
      if (!r.model || !r.service) continue;
      seenServices.add(r.service);
      summedByModel.set(
        r.model,
        (summedByModel.get(r.model) ?? 0) + (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
      );
    }
    for (const [model, total] of totalsByModel.entries()) {
      const summed = summedByModel.get(model) ?? 0;
      // Weights are hand-tuned to sum to ~1 per model; allow small rounding drift.
      expect(Math.abs(summed - total)).toBeLessThanOrEqual(Math.max(2, total * 0.01));
    }
    for (const s of DEMO_SERVICES) expect(seenServices.has(s)).toBe(true);
  });

  it("cache-cost record has a plausible cache-hit rate and a positive SDK-reported cost", () => {
    const cacheRead = DEMO_CACHE_COST_RECORD.cache_read as number;
    const input = DEMO_CACHE_COST_RECORD.input as number;
    const hitRate = cacheRead / (cacheRead + input);
    expect(hitRate).toBeGreaterThan(0.2);
    expect(hitRate).toBeLessThan(0.5);
    expect(DEMO_CACHE_COST_RECORD.cache_write as number).toBeGreaterThan(0);
    expect(DEMO_CACHE_COST_RECORD.sdk_cost as number).toBeGreaterThan(0);
    expect(DEMO_CACHE_COST_RECORD.spans as number).toBeGreaterThan(
      DEMO_MODEL_RECORDS.reduce((acc, r) => acc + (r.requests ?? 0), 0),
    );
  });
});
