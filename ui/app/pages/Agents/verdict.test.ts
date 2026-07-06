import { describe, expect, it } from "vitest";
import { buildAgentVerdict } from "./verdict";
import type { StageBreakdown } from "./useAgents";

const mk = (
  llm: number,
  tool: number,
  retrieval: number,
  orch: number,
): StageBreakdown => ({ llm, tool, retrieval, orch });

describe("buildAgentVerdict", () => {
  it("returns no parts for a healthy, unremarkable agent", () => {
    expect(
      buildAgentVerdict({
        p90Ms: 1000,
        errorRatePct: 0,
        stage: mk(0, 0.3, 0.3, 0.4),
      }),
    ).toEqual([]);
  });

  it("synthesizes the notable signals into one list", () => {
    const parts = buildAgentVerdict({
      p90Ms: 12_000,
      errorRatePct: 8,
      stage: mk(0, 0.1, 0.11, 0.78),
      loopRatePct: 41,
      highFrequency: true,
    });
    expect(parts.some((p) => p.includes("P90"))).toBe(true);
    expect(parts.some((p) => p.includes("Orchestration") && p.includes("78%"))).toBe(true);
    expect(parts.some((p) => p.includes("errors"))).toBe(true);
    expect(parts.some((p) => p.includes("loop rate"))).toBe(true);
    expect(parts).toContain("high tool frequency");
  });

  it("flags a runaway agent distinctly from a merely slow one", () => {
    const runaway = buildAgentVerdict({
      p90Ms: 700_000,
      errorRatePct: 0,
      stage: mk(0, 1, 0, 0),
    });
    expect(runaway.some((p) => p.toLowerCase().includes("runaway"))).toBe(true);
  });

  it("omits sub-threshold signals", () => {
    const parts = buildAgentVerdict({
      p90Ms: 1500, // below slow
      errorRatePct: 4, // <= 5
      stage: mk(0, 0.4, 0.4, 0.2), // no >=50% dominant
      loopRatePct: 5, // < 15
      highFrequency: false,
    });
    expect(parts).toEqual([]);
  });
});
