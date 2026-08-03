import { describe, expect, it } from "vitest";
import {
  DEMO_ARCH_REC,
  DEMO_PULSE_SERIES_REC,
  DEMO_FRAMEWORK_NODE_ROWS,
  DEMO_FRAMEWORK_NODES,
} from "./demoData";

const sum = (xs: (number | null | undefined)[]): number =>
  xs.reduce<number>((a, b) => a + (typeof b === "number" ? b : 0), 0);

describe("archMap demo dataset (DEMO_ARCH_REC)", () => {
  it("every tier count is a positive finite number", () => {
    for (const [key, value] of Object.entries(DEMO_ARCH_REC)) {
      expect(Number.isFinite(value)).toBe(true);
      if (key.endsWith("Spans") || key.endsWith("Tokens")) {
        expect(value).toBeGreaterThan(0);
      }
    }
  });

  it("error/truncation/429 counts stay well below their tier's span count", () => {
    expect(DEMO_ARCH_REC.llmErr).toBeLessThan(DEMO_ARCH_REC.llmSpans);
    expect(DEMO_ARCH_REC.llmTrunc).toBeLessThan(DEMO_ARCH_REC.llmSpans);
    expect(DEMO_ARCH_REC.llm429).toBeLessThan(DEMO_ARCH_REC.llmSpans);
    expect(DEMO_ARCH_REC.agentErr).toBeLessThan(DEMO_ARCH_REC.agentSpans);
    expect(DEMO_ARCH_REC.toolErr).toBeLessThan(DEMO_ARCH_REC.toolSpans);
    expect(DEMO_ARCH_REC.workflowErr).toBeLessThan(DEMO_ARCH_REC.workflowSpans);
  });

  it("tool-tier error rate is intentionally above the 3% warning threshold (map variety)", () => {
    expect(DEMO_ARCH_REC.toolErr / DEMO_ARCH_REC.toolSpans).toBeGreaterThan(0.03);
  });
});

describe("archMap demo per-bucket series (DEMO_PULSE_SERIES_REC)", () => {
  it("additive series (calls/err/tok) sum back to the matching DEMO_ARCH_REC total", () => {
    expect(sum(DEMO_PULSE_SERIES_REC.o_calls ?? [])).toBe(DEMO_ARCH_REC.workflowSpans);
    expect(sum(DEMO_PULSE_SERIES_REC.a_calls ?? [])).toBe(DEMO_ARCH_REC.agentSpans);
    expect(sum(DEMO_PULSE_SERIES_REC.t_calls ?? [])).toBe(DEMO_ARCH_REC.toolSpans);
    expect(sum(DEMO_PULSE_SERIES_REC.l_calls ?? [])).toBe(DEMO_ARCH_REC.llmSpans);
    expect(sum(DEMO_PULSE_SERIES_REC.l_tok ?? [])).toBe(DEMO_ARCH_REC.llmTokens);
  });

  it("every series has the same bucket count and every value is finite", () => {
    const len = (DEMO_PULSE_SERIES_REC.l_calls ?? []).length;
    expect(len).toBeGreaterThanOrEqual(2);
    for (const key of ["o_calls", "a_calls", "t_calls", "l_calls", "o_p90", "a_p90", "t_p90", "l_p90", "p95"] as const) {
      const arr = DEMO_PULSE_SERIES_REC[key] ?? [];
      expect(arr.length).toBe(len);
      for (const v of arr) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("peak-folded latency series (p90/p95) top out at the intended peak", () => {
    expect(Math.max(...(DEMO_PULSE_SERIES_REC.l_p90 ?? []).map(Number))).toBe(DEMO_ARCH_REC.llmP90Ns);
    expect(Math.max(...(DEMO_PULSE_SERIES_REC.o_p90 ?? []).map(Number))).toBe(DEMO_ARCH_REC.workflowP90Ns);
  });
});

describe("archMap demo framework nodes", () => {
  it("raw rows sum to the workflow-tier total", () => {
    expect(sum(DEMO_FRAMEWORK_NODE_ROWS.map((r) => Number(r.n)))).toBe(DEMO_ARCH_REC.workflowSpans);
  });

  it("folds into typed nodes via the real rowsToFrameworkNodes, 'Other' last", () => {
    expect(DEMO_FRAMEWORK_NODES.length).toBe(DEMO_FRAMEWORK_NODE_ROWS.length);
    expect(DEMO_FRAMEWORK_NODES[DEMO_FRAMEWORK_NODES.length - 1].id).toBe("other");
    for (const n of DEMO_FRAMEWORK_NODES) {
      expect(n.count).toBeGreaterThan(0);
      expect(Number.isFinite(n.errorRate)).toBe(true);
      expect(Number.isFinite(n.p90Ms)).toBe(true);
    }
    // Sorted by count desc (excluding the always-last "Other").
    const nonOther = DEMO_FRAMEWORK_NODES.filter((n) => n.id !== "other");
    for (let i = 1; i < nonOther.length; i++) {
      expect(nonOther[i - 1].count).toBeGreaterThanOrEqual(nonOther[i].count);
    }
  });
});
