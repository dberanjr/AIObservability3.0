import { describe, expect, it } from "vitest";
import {
  DEMO_CELL_RECORDS,
  DEMO_SERVICE_RECORDS,
  DEMO_SERVICE_MODEL_DETAIL,
  DEMO_RAG_RECORDS,
} from "./demoData";
import { toService } from "./parseAIServices";
import { foldHeatmapRecords } from "./foldHeatmap";
import { foldDetailMetrics } from "./foldDetailMetrics";
import { foldRagRecords } from "./parseRag";
import { canonicalizeModel } from "../../detection/attributes";

describe("Explorer demo dataset", () => {
  const services = DEMO_SERVICE_RECORDS.map(toService).filter(
    (s): s is NonNullable<typeof s> => s != null,
  );
  const heatmap = foldHeatmapRecords(DEMO_CELL_RECORDS);

  it("every service record folds into a valid, non-empty AIService via the real toService parser", () => {
    expect(services.length).toBe(DEMO_SERVICE_RECORDS.length);
    for (const s of services) {
      expect(s.requests).toBeGreaterThan(0);
      expect(s.tokens).toBeGreaterThan(0);
      expect(Number.isFinite(s.errorRatePct)).toBe(true);
      expect(Number.isFinite(s.tokPerReq)).toBe(true);
      expect(s.models.length).toBeGreaterThan(0);
    }
  });

  it("exercises both a single-model service (clean cost) and a 4+-model service (multi-model finding + chip overflow)", () => {
    const devtools = services.find((s) => s.service === "internal-devtools-bot");
    const support = services.find((s) => s.service === "support-copilot-svc");
    expect(devtools?.models.length).toBe(1);
    expect(support?.models.length).toBeGreaterThanOrEqual(4);
  });

  it("per-service requests/tokens reconcile exactly with the sum of that service's heatmap cells", () => {
    for (const s of services) {
      const cells = DEMO_CELL_RECORDS.filter((c) => c.service_id === s.serviceId);
      expect(cells.length).toBeGreaterThan(0);
      const cellRequests = cells.reduce((a, c) => a + (c.requests ?? 0), 0);
      const cellTokens = cells.reduce((a, c) => a + (c.tokens ?? 0), 0);
      expect(s.requests).toBe(cellRequests);
      expect(s.tokens).toBe(cellTokens);
    }
  });

  it("heatmap folds into one row per service and groups the two Claude Sonnet 4.6 raw variants under one column", () => {
    expect(heatmap.rows.length).toBe(DEMO_SERVICE_RECORDS.length);
    expect(heatmap.maxCellTokens).toBeGreaterThan(0);
    const sonnetCol = heatmap.columns.find((c) => c.model === "Claude Sonnet 4.6");
    expect(sonnetCol).toBeDefined();
    expect(sonnetCol!.rawModels.length).toBe(2);
  });

  it("every seed cell's detail row folds to finite, internally-consistent metrics matching its heatmap cell", () => {
    const entries = Object.entries(DEMO_SERVICE_MODEL_DETAIL);
    expect(entries.length).toBe(DEMO_CELL_RECORDS.length);
    for (const [key, row] of entries) {
      const metrics = foldDetailMetrics(row);
      expect(metrics.requests).toBeGreaterThan(0);
      expect(Number.isFinite(metrics.errorRatePct)).toBe(true);
      expect(metrics.errorRatePct).toBeGreaterThanOrEqual(0);
      expect(metrics.p50Ms).toBeGreaterThan(0);
      expect(metrics.p90Ms).toBeGreaterThanOrEqual(metrics.p50Ms);
      expect(metrics.p95Ms).toBeGreaterThanOrEqual(metrics.p90Ms);

      // The key is `${service}::${canonicalLabel}` — confirm it round-trips
      // through the same canonicalization the heatmap/modal use at lookup
      // time, and that the cell it corresponds to reports the same tokens.
      const [service, label] = key.split("::");
      const cell = DEMO_CELL_RECORDS.find(
        (c) =>
          c.service === service &&
          canonicalizeModel(c.model).label === label &&
          (c.tokens ?? 0) === (metrics.inTok + metrics.outTok),
      );
      expect(cell).toBeDefined();
    }
  });

  it("fleet totals land in a realistic, non-trivial range (thousands of requests, millions of tokens, a sub-5% error rate)", () => {
    const totalRequests = services.reduce((a, s) => a + s.requests, 0);
    const totalTokens = services.reduce((a, s) => a + s.tokens, 0);
    const totalErrors = services.reduce((a, s) => a + s.errors, 0);
    expect(totalRequests).toBeGreaterThan(10_000);
    expect(totalTokens).toBeGreaterThan(5_000_000);
    const errorRatePct = (totalErrors / totalRequests) * 100;
    expect(errorRatePct).toBeGreaterThan(0);
    expect(errorRatePct).toBeLessThan(5);
  });

  it("at least two services carry logical (HTTP-200 payload-level) errors", () => {
    const withLogical = services.filter((s) => s.logicalErrors > 0);
    expect(withLogical.length).toBeGreaterThanOrEqual(2);
  });

  it("RAG demo fixtures fold to positive, non-trivial totals across every vector store", () => {
    const folded = foldRagRecords(DEMO_RAG_RECORDS, 1);
    expect(folded.storeCount).toBe(DEMO_RAG_RECORDS.length);
    expect(folded.totalQueries).toBeGreaterThan(0);
    expect(folded.avgTopK).toBeGreaterThan(0);
    for (const s of folded.stores) expect(s.queries).toBeGreaterThan(0);
  });
});
