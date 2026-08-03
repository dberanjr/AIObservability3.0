/**
 * Internal-consistency checks for the Pulse-EXCLUSIVE demo fixtures added to
 * `./demoData.ts` (useHealthContributors, useSafety, useFeedback,
 * useTileBreakdowns, useTokenConsumption) — the hooks with no other page as a
 * caller. The shared hooks that Summary also reuses (usePulseSummary,
 * usePulseHealth, useDailySpend, useTokenEfficiency, useProviderMix,
 * useAgentCosts, useActivityHistogram) have their own `demoData.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  DEMO_TOKEN_SERIES_ROW,
  DEMO_SLOW_AGENT_RECORDS,
  DEMO_SLOW_MODEL_RECORDS,
  DEMO_SAFETY_COUNTS,
  DEMO_SAFETY_ACTIONS,
  DEMO_FEEDBACK_COUNTS,
  DEMO_FEEDBACK_LABELS,
  DEMO_PROMPT_VERSIONS,
  DEMO_TILE_MODEL_RECORDS,
  DEMO_TILE_SERVER_RECORDS,
  DEMO_TILE_TOOL_RECORDS,
  DEMO_TOTAL_TOKENS,
  DEMO_TOTAL_REQUESTS,
} from "./demoData";
import { computeHealthContributors, foldTileBreakdowns } from "./parseHealthAndTiles";

describe("useTokenConsumption demo fixture", () => {
  it("bucket tokens sum to the fleet total tokens", () => {
    const total = DEMO_TOKEN_SERIES_ROW.tokens.reduce((a, b) => a + b, 0);
    expect(total).toBe(DEMO_TOTAL_TOKENS);
    expect(DEMO_TOKEN_SERIES_ROW.tokens.length).toBeGreaterThanOrEqual(2);
  });
});

describe("useHealthContributors demo fixtures", () => {
  it("fold through the real computeHealthContributors and produce a non-empty, sorted errorAgents list", () => {
    const result = computeHealthContributors(DEMO_SLOW_AGENT_RECORDS, DEMO_SLOW_MODEL_RECORDS);
    expect(result.slowAgents.length).toBe(DEMO_SLOW_AGENT_RECORDS.length);
    expect(result.slowModels.length).toBe(DEMO_SLOW_MODEL_RECORDS.length);
    expect(result.errorAgents.length).toBeGreaterThan(0);
    for (let i = 1; i < result.errorAgents.length; i++) {
      expect(result.errorAgents[i - 1].errorRatePct ?? 0).toBeGreaterThanOrEqual(
        result.errorAgents[i].errorRatePct ?? 0,
      );
    }
  });
});

describe("useSafety demo fixtures", () => {
  it("guardrail + pii counts stay within the total span count", () => {
    expect(DEMO_SAFETY_COUNTS.guardrail).toBeLessThanOrEqual(DEMO_SAFETY_COUNTS.spans);
    expect(DEMO_SAFETY_COUNTS.pii).toBeLessThanOrEqual(DEMO_SAFETY_COUNTS.spans);
  });
  it("action counts sum to the guardrail-checked span count (not the fleet total)", () => {
    const total = DEMO_SAFETY_ACTIONS.reduce((a, r) => a + r.n, 0);
    expect(total).toBe(DEMO_SAFETY_COUNTS.guardrail);
  });
});

describe("useFeedback demo fixtures", () => {
  it("has a plausible 1-5 average rating and a positive feedback count", () => {
    expect(DEMO_FEEDBACK_COUNTS.n).toBeGreaterThan(0);
    expect(DEMO_FEEDBACK_COUNTS.avg_rating).toBeGreaterThan(0);
    expect(DEMO_FEEDBACK_COUNTS.avg_rating).toBeLessThanOrEqual(5);
  });
  it("label counts sum to the total feedback count", () => {
    const total = DEMO_FEEDBACK_LABELS.reduce((a, l) => a + l.n, 0);
    expect(total).toBe(DEMO_FEEDBACK_COUNTS.n);
  });
  it("prompt versions is at least the prompt count (each prompt has >=1 version)", () => {
    expect(DEMO_PROMPT_VERSIONS.versions).toBeGreaterThanOrEqual(DEMO_PROMPT_VERSIONS.prompts);
  });
});

describe("useTileBreakdowns demo fixtures", () => {
  it("model tile requests reconcile with the fleet's total request count", () => {
    const total = DEMO_TILE_MODEL_RECORDS.reduce((a, r) => a + r.requests, 0);
    expect(total).toBe(DEMO_TOTAL_REQUESTS);
  });

  it("folds through the real foldTileBreakdowns into sorted, priced slices", () => {
    const result = foldTileBreakdowns(
      DEMO_TILE_MODEL_RECORDS,
      DEMO_TILE_SERVER_RECORDS,
      DEMO_TILE_TOOL_RECORDS,
      1,
    );
    expect(result.models.length).toBe(DEMO_TILE_MODEL_RECORDS.length);
    expect(result.mcpServers.length).toBe(DEMO_TILE_SERVER_RECORDS.length);
    expect(result.mcpTools.length).toBe(DEMO_TILE_TOOL_RECORDS.length);
    for (const m of result.models) {
      expect(m.cost).toBeGreaterThan(0);
      expect(m.tokens).toBeGreaterThan(0);
    }
    // Sorted by value (request/call volume) descending.
    for (let i = 1; i < result.models.length; i++) {
      expect(result.models[i - 1].value).toBeGreaterThanOrEqual(result.models[i].value);
    }
  });
});
