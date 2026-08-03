import { describe, expect, it } from "vitest";
import {
  DEMO_ACCOUNTS,
  DEMO_OVERVIEW_TOTALS,
  DEMO_DAILY_COST,
  DEMO_COST_SUMMARY,
  DEMO_COST_SPARK,
  DEMO_ACCOUNT_COST_ROWS,
  DEMO_AGENT_SESSION_ROWS,
  DEMO_PERF_ROWS,
  DEMO_PERF_SERIES,
  DEMO_TPM_PEAK_PCT,
  DEMO_FACETS,
  DEMO_TPM_BY_MODEL,
  DEMO_LOG_DELIVERY,
  DEMO_LATENCY_BANDS,
  DEMO_TTFT_BANDS,
  DEMO_PER_MODEL_SUMMARY,
} from "./demoData";

describe("Bedrock demo dataset", () => {
  it("has a non-empty, non-NaN overview", () => {
    expect(DEMO_OVERVIEW_TOTALS.invocations).toBeGreaterThan(0);
    expect(DEMO_OVERVIEW_TOTALS.accounts).toBe(DEMO_ACCOUNTS.length);
    expect(Number.isFinite(DEMO_OVERVIEW_TOTALS.inTok)).toBe(true);
    expect(Number.isFinite(DEMO_OVERVIEW_TOTALS.outTok)).toBe(true);
  });

  it("daily cost buckets are all finite and sum to the summary total", () => {
    expect(DEMO_DAILY_COST.length).toBeGreaterThan(0);
    const summed = DEMO_DAILY_COST.reduce((s, d) => s + d.actual, 0);
    expect(summed).toBeCloseTo(DEMO_COST_SUMMARY.total, 0);
    for (const d of DEMO_DAILY_COST) expect(Number.isFinite(d.actual)).toBe(true);
  });

  it("cost summary includes at least one blended/estimated model (the deliberately-unpriced Llama id)", () => {
    expect(DEMO_COST_SUMMARY.estimatedModels.length).toBeGreaterThan(0);
    expect(DEMO_COST_SUMMARY.total).toBeGreaterThan(0);
  });

  it("cost spark reconciles to the same total as the daily chart", () => {
    const sparkTotal = DEMO_COST_SPARK.values.reduce((s, v) => s + v, 0);
    expect(sparkTotal).toBeCloseTo(DEMO_COST_SUMMARY.total, 0);
    expect(DEMO_COST_SPARK.labels.length).toBe(DEMO_COST_SPARK.values.length);
  });

  it("account cost rows cover every demo account", () => {
    expect(DEMO_ACCOUNT_COST_ROWS.map((r) => r.account).sort()).toEqual([...DEMO_ACCOUNTS].sort());
    for (const r of DEMO_ACCOUNT_COST_ROWS) expect(r.cost).toBeGreaterThan(0);
  });

  it("agent session rows are non-empty and every row has a positive invocation count", () => {
    expect(DEMO_AGENT_SESSION_ROWS.length).toBeGreaterThan(0);
    for (const r of DEMO_AGENT_SESSION_ROWS) expect(r.invocations).toBeGreaterThan(0);
    // At least the two deliberately multi-model sessions carry >1 model.
    expect(DEMO_AGENT_SESSION_ROWS.filter((r) => r.models.length > 1).length).toBeGreaterThanOrEqual(2);
  });

  it("per-model perf rows + cross-model series line up with the TPM peak", () => {
    expect(DEMO_PERF_ROWS.length).toBeGreaterThan(0);
    expect(DEMO_TPM_PEAK_PCT).toBeGreaterThan(0);
    expect(Math.max(...DEMO_PERF_SERIES.tpm)).toBeCloseTo(DEMO_TPM_PEAK_PCT, 0);
  });

  it("facets list every demo account and model", () => {
    expect(DEMO_FACETS.accounts.sort()).toEqual([...DEMO_ACCOUNTS].sort());
    expect(DEMO_FACETS.modelGroups.length).toBeGreaterThan(0);
  });

  it("Runtime 2.0 metric constants are populated and finite", () => {
    expect(DEMO_TPM_BY_MODEL.length).toBeGreaterThan(0);
    expect(DEMO_LOG_DELIVERY.total).toBeGreaterThan(0);
    expect(DEMO_LATENCY_BANDS.avg.length).toBeGreaterThan(0);
    expect(DEMO_TTFT_BANDS.avg.length).toBeGreaterThan(0);
    expect(DEMO_PER_MODEL_SUMMARY.length).toBeGreaterThan(0);
    for (const row of DEMO_PER_MODEL_SUMMARY) {
      expect(Number.isFinite(row.latencyMs)).toBe(true);
      expect(Number.isFinite(row.ttftMs)).toBe(true);
    }
  });
});
