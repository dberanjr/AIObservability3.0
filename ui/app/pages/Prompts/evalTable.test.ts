import { describe, expect, it } from "vitest";
import type { PromptRow } from "./usePrompts";
import {
  anyRowHasEval,
  evalBadness,
  evalTableRows,
  rowHasEval,
  worstModelsForMetric,
} from "./evalTable";

const base: PromptRow = {
  id: "x",
  timestampMs: 0,
  kind: "LLM",
  typeLabel: "chat",
  service: "svc",
  serviceId: "svc-id",
  provider: "openai",
  model: "gpt-4o",
  agent: null,
  temperature: null,
  inTokens: 0,
  outTokens: 0,
  inCost: 0,
  outCost: 0,
  durationMs: 0,
  promptText: "",
  responseText: "",
  systemPrompt: null,
  piiDetected: false,
  hasWarning: false,
  hasError: false,
  truncated: false,
  evalHallucination: null,
  evalCorrectness: null,
  evalFaithfulness: null,
  evalRelevance: null,
  traceId: null,
  spanId: null,
};

const row = (over: Partial<PromptRow>): PromptRow => ({ ...base, ...over });

describe("rowHasEval / anyRowHasEval", () => {
  it("detects any non-null eval field", () => {
    expect(rowHasEval(base)).toBe(false);
    expect(rowHasEval(row({ evalRelevance: 0.9 }))).toBe(true);
    expect(anyRowHasEval([base, row({ evalCorrectness: 0.5 })])).toBe(true);
    expect(anyRowHasEval([base])).toBe(false);
  });
});

describe("evalBadness", () => {
  it("treats high hallucination and low correctness as bad", () => {
    const bad = row({ evalHallucination: 0.9, evalCorrectness: 0.1 });
    const good = row({ evalHallucination: 0.0, evalCorrectness: 1.0 });
    expect(evalBadness(bad)).toBeGreaterThan(evalBadness(good));
  });
  it("averages only present metrics", () => {
    // Only correctness present at 0.25 → badness 0.75.
    expect(evalBadness(row({ evalCorrectness: 0.25 }))).toBeCloseTo(0.75);
  });
});

describe("evalTableRows", () => {
  it("keeps only scored rows and orders worst-first", () => {
    const rows = [
      row({ id: "good", evalCorrectness: 0.95 }),
      row({ id: "none" }),
      row({ id: "bad", evalCorrectness: 0.2 }),
    ];
    const out = evalTableRows(rows);
    expect(out.map((r) => r.id)).toEqual(["bad", "good"]);
  });
  it("breaks ties by most-recent", () => {
    const rows = [
      row({ id: "old", evalCorrectness: 0.5, timestampMs: 1 }),
      row({ id: "new", evalCorrectness: 0.5, timestampMs: 2 }),
    ];
    expect(evalTableRows(rows).map((r) => r.id)).toEqual(["new", "old"]);
  });
});

describe("worstModelsForMetric", () => {
  it("ranks the worst models by hallucination (higher = worse)", () => {
    const rows = [
      row({ model: "gpt-4o", evalHallucination: 0.1 }),
      row({ model: "gpt-4o", evalHallucination: 0.3 }),
      row({ model: "claude", evalHallucination: 0.8 }),
    ];
    const out = worstModelsForMetric(rows, "evalHallucination", 3);
    expect(out[0].model).toBe("claude");
    expect(out[0].score).toBeCloseTo(0.8);
    expect(out[1].model).toBe("gpt-4o");
    expect(out[1].score).toBeCloseTo(0.2);
    expect(out[1].count).toBe(2);
  });
  it("ranks the worst models by correctness (lower = worse)", () => {
    const rows = [
      row({ model: "a", evalCorrectness: 0.9 }),
      row({ model: "b", evalCorrectness: 0.2 }),
    ];
    expect(worstModelsForMetric(rows, "evalCorrectness")[0].model).toBe("b");
  });
});
