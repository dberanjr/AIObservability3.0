import { describe, expect, it } from "vitest";
import {
  perfForModel,
  perfForSession,
  primaryModelKey,
  sessionModelPerf,
  toPerfKey,
} from "./agentSessionPerf";
import type { AgentSessionRow, PerfByModelRow } from "../../bedrock/parse";

const perfRows: PerfByModelRow[] = [
  { model: "claude-sonnet-4-6", latencyMs: 5800, ttftMs: 4400, invocations: 49 },
  { model: "nova-lite", latencyMs: 900, ttftMs: 300, invocations: 12 },
];

const sessionRow = (models: string[]): AgentSessionRow => ({
  session: "s-1",
  account: "111111111111",
  models,
  invocations: 10,
  inTok: 1000,
  outTok: 500,
  cachePct: 20,
  estCost: 1.23,
  blended: false,
  errorRate: 0,
});

describe("toPerfKey / primaryModelKey", () => {
  it("re-keys a shortModelName (case, version and date preserved) into normalizeBedrockModelId space", () => {
    // shortModelName strips only region/vendor/ARN — case, -v1 revision and
    // the date suffix survive, which is exactly what breaks a naive ===
    // match against perf rows (see the comment in agentSessionPerf.ts).
    expect(toPerfKey("claude-sonnet-4-6-20250219-v1:0")).toBe("claude-sonnet-4-6");
  });

  it("reads the first model in the row as the primary", () => {
    expect(primaryModelKey(sessionRow(["claude-sonnet-4-6-20250219-v1:0", "nova-lite"]))).toBe(
      "claude-sonnet-4-6",
    );
  });

  it("returns an empty key for a session with no models", () => {
    expect(primaryModelKey(sessionRow([]))).toBe("");
  });
});

describe("perfForModel / perfForSession", () => {
  it("matches a dated/versioned short model name against the normalized perf row", () => {
    expect(perfForModel("claude-sonnet-4-6-20250219-v1:0", perfRows)?.latencyMs).toBe(5800);
  });

  it("returns undefined (not a 0-latency row) when no perf row matches", () => {
    expect(perfForModel("titan-embed-text-v1", perfRows)).toBeUndefined();
    expect(perfForSession(sessionRow(["titan-embed-text-v1"]), perfRows)).toBeUndefined();
  });

  it("returns undefined for a session with no models rather than throwing", () => {
    expect(perfForSession(sessionRow([]), perfRows)).toBeUndefined();
  });

  it("joins the session's PRIMARY model even when a later model would also match", () => {
    const row = sessionRow(["titan-embed-text-v1", "claude-sonnet-4-6-20250219-v1:0"]);
    expect(perfForSession(row, perfRows)).toBeUndefined();
  });
});

describe("sessionModelPerf", () => {
  it("looks up every model on the session, keeping unmatched ones with perf: undefined", () => {
    const row = sessionRow(["claude-sonnet-4-6-20250219-v1:0", "titan-embed-text-v1"]);
    const result = sessionModelPerf(row, perfRows);
    expect(result).toEqual([
      { model: "claude-sonnet-4-6-20250219-v1:0", perf: perfRows[0] },
      { model: "titan-embed-text-v1", perf: undefined },
    ]);
  });
});
