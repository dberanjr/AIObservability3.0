import { describe, expect, it } from "vitest";
import {
  DEMO_FLEET_COUNTS,
  DEMO_HIDDEN_FAILURES,
  DEMO_PROBLEM_PATTERNS,
} from "./demoData";
import { FOCUS_PREDICATES, CROSS_SPAN_FOCUS } from "../Prompts/focus";

describe("Summary demo dataset", () => {
  it("fleet counts are positive", () => {
    expect(DEMO_FLEET_COUNTS.services).toBeGreaterThan(0);
    expect(DEMO_FLEET_COUNTS.agents).toBeGreaterThan(0);
  });

  it("useHiddenFailures: every category folds to a positive count", () => {
    expect(DEMO_HIDDEN_FAILURES.categories.length).toBeGreaterThan(0);
    expect(DEMO_HIDDEN_FAILURES.total).toBeGreaterThan(0);
    for (const c of DEMO_HIDDEN_FAILURES.categories) expect(c.count).toBeGreaterThan(0);
  });

  it("useProblemPatternCounts: covers every real same-span + cross-span detector id", () => {
    const ids = DEMO_PROBLEM_PATTERNS.map((p) => p.id).sort();
    const expectedIds = [
      ...Object.keys(FOCUS_PREDICATES),
      ...Object.keys(CROSS_SPAN_FOCUS),
    ].sort();
    expect(ids).toEqual(expectedIds);
    // Every demo pattern should have a real (positive) match count so the
    // detector list never renders a row that reads as a false all-clear.
    for (const p of DEMO_PROBLEM_PATTERNS) expect(p.count).toBeGreaterThan(0);
    // Cross-span approximate flags should carry over from the real registry.
    const topk = DEMO_PROBLEM_PATTERNS.find((p) => p.id === "vdb-topk-over-retrieval");
    expect(topk?.approximate).toBe(true);
    // Patterns are ranked descending by count.
    for (let i = 1; i < DEMO_PROBLEM_PATTERNS.length; i++) {
      expect(DEMO_PROBLEM_PATTERNS[i - 1].count).toBeGreaterThanOrEqual(DEMO_PROBLEM_PATTERNS[i].count);
    }
  });
});
