import { describe, expect, it } from "vitest";
import { STAGE_META, dominantStage, stageMixLabel } from "./stageMix";
import type { StageBreakdown } from "./useAgents";

const mk = (
  llm: number,
  tool: number,
  retrieval: number,
  orch: number,
): StageBreakdown => ({ llm, tool, retrieval, orch });

describe("STAGE_META", () => {
  it("covers the four tiers in a stable order", () => {
    expect(STAGE_META.map((s) => s.key)).toEqual([
      "llm",
      "tool",
      "retrieval",
      "orch",
    ]);
  });
});

describe("dominantStage", () => {
  it("returns the stage with the largest share", () => {
    const dom = dominantStage(mk(0, 0.4, 0.1, 0.5));
    expect(dom?.key).toBe("orch");
    expect(dom?.label).toBe("Orchestration");
    expect(dom?.frac).toBeCloseTo(0.5);
  });

  it("returns null when every stage is zero", () => {
    expect(dominantStage(mk(0, 0, 0, 0))).toBeNull();
  });
});

describe("stageMixLabel", () => {
  it("names every non-omitted tier with its rounded percentage", () => {
    const label = stageMixLabel(mk(0, 0.4, 0.1, 0.5));
    expect(label).toContain("Span mix");
    expect(label).toContain("Tool 40%");
    expect(label).toContain("Retrieval 10%");
    expect(label).toContain("Orchestration 50%");
  });
});
