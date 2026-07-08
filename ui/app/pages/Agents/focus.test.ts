import { describe, expect, it } from "vitest";
import {
  AGENT_FOCUS_PRESETS,
  agentsFocusPreset,
  applyAgentsFocus,
  isAgentsFocus,
  type FocusContext,
} from "./focus";
import type { AgentRow } from "./useAgents";
import type { StageBreakdown } from "./useAgents";

const AGENT_IDS = [
  "agent-n1-tool-calls",
  "agent-degradation",
  "tool-retry-storm",
  "vdb-topk-over-retrieval",
  "mem-history-growth",
  "orch-reasoning-loop",
] as const;

const stage = (s: Partial<StageBreakdown> = {}): StageBreakdown => ({
  llm: 0,
  tool: 0,
  retrieval: 0,
  orch: 0,
  ...s,
});

const row = (over: Partial<AgentRow>): AgentRow => ({
  agent: "a",
  service: "svc",
  serviceId: "svc-id",
  framework: null,
  models: [],
  invocations: 0,
  p50Ms: 0,
  p90Ms: 0,
  p99Ms: 0,
  avgMs: 0,
  errors: 0,
  errorRatePct: 0,
  inputTokens: 0,
  outputTokens: 0,
  llmCount: 0,
  toolCount: 0,
  hasLlmChild: false,
  hasToolChild: false,
  ttftMs: null,
  cost: 0,
  costPerInvocation: 0,
  costAttributed: false,
  operations: [],
  stage: stage(),
  isOrchestration: false,
  ...over,
});

describe("AGENT_FOCUS_PRESETS — catalog", () => {
  it("defines all 6 agent-tier ids with a non-empty label + apply fn", () => {
    for (const id of AGENT_IDS) {
      const preset = AGENT_FOCUS_PRESETS[id];
      expect(preset, `missing preset ${id}`).toBeDefined();
      expect(preset.label.length).toBeGreaterThan(0);
      expect(typeof preset.apply).toBe("function");
    }
  });

  it("recognises known ids and rejects unknown / empty / null", () => {
    expect(isAgentsFocus("agent-degradation")).toBe(true);
    expect(isAgentsFocus("agent-nope")).toBe(false);
    expect(isAgentsFocus(null)).toBe(false);
    expect(isAgentsFocus(undefined)).toBe(false);
    expect(isAgentsFocus("")).toBe(false);
  });

  it("resolves a preset only for known ids", () => {
    expect(agentsFocusPreset("orch-reasoning-loop")).toBe(
      AGENT_FOCUS_PRESETS["orch-reasoning-loop"],
    );
    expect(agentsFocusPreset("nope")).toBeUndefined();
  });

  it("flags the proxy-signal presets as approximate, exact ones not", () => {
    expect(AGENT_FOCUS_PRESETS["agent-degradation"].approximate).toBeFalsy();
    expect(AGENT_FOCUS_PRESETS["agent-n1-tool-calls"].approximate).toBeFalsy();
    expect(AGENT_FOCUS_PRESETS["tool-retry-storm"].approximate).toBe(true);
    expect(AGENT_FOCUS_PRESETS["vdb-topk-over-retrieval"].approximate).toBe(true);
    expect(AGENT_FOCUS_PRESETS["mem-history-growth"].approximate).toBe(true);
  });
});

describe("applyAgentsFocus — no-op cases", () => {
  const rows = [row({ agent: "x" }), row({ agent: "y" })];
  it("returns rows unchanged for an unknown focus", () => {
    expect(applyAgentsFocus("nope", rows)).toBe(rows);
  });
  it("returns rows unchanged for null / undefined / empty focus", () => {
    expect(applyAgentsFocus(null, rows)).toBe(rows);
    expect(applyAgentsFocus(undefined, rows)).toBe(rows);
    expect(applyAgentsFocus("", rows)).toBe(rows);
  });
  it("does not mutate the input array", () => {
    const input = [
      row({ agent: "a", errors: 1, errorRatePct: 2 }),
      row({ agent: "b", errors: 1, errorRatePct: 9 }),
    ];
    const snapshot = input.map((r) => r.agent);
    applyAgentsFocus("agent-degradation", input);
    expect(input.map((r) => r.agent)).toEqual(snapshot);
  });
});

describe("agent-degradation", () => {
  it("keeps only error-bearing agents, sorted by error rate then p90 desc", () => {
    const rows = [
      row({ agent: "clean", errors: 0, errorRatePct: 0, p90Ms: 9000 }),
      row({ agent: "mild", errors: 1, errorRatePct: 3, p90Ms: 500 }),
      row({ agent: "bad", errors: 5, errorRatePct: 12, p90Ms: 100 }),
      row({ agent: "tieA", errors: 2, errorRatePct: 3, p90Ms: 800 }),
    ];
    const out = applyAgentsFocus("agent-degradation", rows);
    expect(out.map((r) => r.agent)).toEqual(["bad", "tieA", "mild"]);
    expect(out.find((r) => r.agent === "clean")).toBeUndefined();
  });
});

describe("agent-n1-tool-calls", () => {
  it("filters to N+1-flagged agents, sorted by tool count desc", () => {
    const rows = [
      row({ agent: "flagged-hi", toolCount: 40, invocations: 5 }),
      row({ agent: "flagged-lo", toolCount: 12, invocations: 5 }),
      row({ agent: "unflagged", toolCount: 99, invocations: 5 }),
    ];
    const ctx: FocusContext = {
      highFreqAgents: new Set(["flagged-hi", "flagged-lo"]),
    };
    const out = applyAgentsFocus("agent-n1-tool-calls", rows, ctx);
    expect(out.map((r) => r.agent)).toEqual(["flagged-hi", "flagged-lo"]);
  });
  it("falls back to sorting all rows by tool count when no flag set", () => {
    const rows = [
      row({ agent: "lo", toolCount: 1 }),
      row({ agent: "hi", toolCount: 50 }),
    ];
    const out = applyAgentsFocus("agent-n1-tool-calls", rows);
    expect(out.map((r) => r.agent)).toEqual(["hi", "lo"]);
  });
});

describe("tool-retry-storm", () => {
  it("ranks tool-using / flagged agents by error rate desc", () => {
    const rows = [
      row({ agent: "tool-bad", toolCount: 3, errorRatePct: 10 }),
      row({ agent: "tool-ok", toolCount: 3, errorRatePct: 1 }),
      row({ agent: "no-tool", toolCount: 0, errorRatePct: 99 }),
    ];
    const out = applyAgentsFocus("tool-retry-storm", rows);
    expect(out.map((r) => r.agent)).toEqual(["tool-bad", "tool-ok"]);
  });
  it("includes N+1-flagged agents even with zero tool spans", () => {
    const rows = [
      row({ agent: "flagged", toolCount: 0, errorRatePct: 5 }),
      row({ agent: "plain", toolCount: 0, errorRatePct: 50 }),
    ];
    const ctx: FocusContext = { highFreqAgents: new Set(["flagged"]) };
    const out = applyAgentsFocus("tool-retry-storm", rows, ctx);
    expect(out.map((r) => r.agent)).toEqual(["flagged"]);
  });
  it("falls back to error-bearing agents when no tool signal at all", () => {
    const rows = [
      row({ agent: "err", toolCount: 0, errors: 2, errorRatePct: 7 }),
      row({ agent: "clean", toolCount: 0, errors: 0, errorRatePct: 0 }),
    ];
    const out = applyAgentsFocus("tool-retry-storm", rows);
    expect(out.map((r) => r.agent)).toEqual(["err"]);
  });
});

describe("vdb-topk-over-retrieval", () => {
  it("keeps retrieval-doing agents, sorted by retrieval share desc", () => {
    const rows = [
      row({ agent: "heavy", stage: stage({ retrieval: 0.8 }), invocations: 1 }),
      row({ agent: "light", stage: stage({ retrieval: 0.2 }), invocations: 1 }),
      row({ agent: "none", stage: stage({ orch: 1 }), invocations: 99 }),
    ];
    const out = applyAgentsFocus("vdb-topk-over-retrieval", rows);
    expect(out.map((r) => r.agent)).toEqual(["heavy", "light"]);
  });
});

describe("orch-reasoning-loop", () => {
  it("keeps agents with non-zero loop rate, sorted by loop rate desc", () => {
    const rows = [
      row({ agent: "looper", invocations: 1 }),
      row({ agent: "spinner", invocations: 1 }),
      row({ agent: "fine", invocations: 99 }),
    ];
    const ctx: FocusContext = {
      loopByAgent: new Map([
        ["looper", { loopRatePct: 40, runs: 5, avgNodesPerRun: 3 }],
        ["spinner", { loopRatePct: 90, runs: 2, avgNodesPerRun: 9 }],
        ["fine", { loopRatePct: 0, runs: 10, avgNodesPerRun: 1 }],
      ]),
    };
    const out = applyAgentsFocus("orch-reasoning-loop", rows, ctx);
    expect(out.map((r) => r.agent)).toEqual(["spinner", "looper"]);
  });
  it("falls back to invocations desc with no loop signal", () => {
    const rows = [row({ agent: "lo", invocations: 1 }), row({ agent: "hi", invocations: 9 })];
    const out = applyAgentsFocus("orch-reasoning-loop", rows);
    expect(out.map((r) => r.agent)).toEqual(["hi", "lo"]);
  });
});

describe("mem-history-growth", () => {
  it("keeps agents with loop/state context, sorted by run volume desc", () => {
    const rows = [
      row({ agent: "big-state", invocations: 1 }),
      row({ agent: "small-state", invocations: 1 }),
      row({ agent: "no-state", invocations: 99 }),
    ];
    const ctx: FocusContext = {
      loopByAgent: new Map([
        ["big-state", { loopRatePct: 0, runs: 50, avgNodesPerRun: 2 }],
        ["small-state", { loopRatePct: 0, runs: 5, avgNodesPerRun: 2 }],
      ]),
    };
    const out = applyAgentsFocus("mem-history-growth", rows, ctx);
    expect(out.map((r) => r.agent)).toEqual(["big-state", "small-state"]);
  });
});
