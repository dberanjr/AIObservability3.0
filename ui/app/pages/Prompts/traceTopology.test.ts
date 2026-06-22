import { describe, expect, it } from "vitest";
import { buildLayout } from "./TraceTopology";
import type { TraceSpan } from "./useTraceSpans";
import type { IndicatorState } from "./TraceTree";

const ALL_VISIBLE: IndicatorState = {
  agent: true,
  llm: true,
  tool: true,
  other: true,
};

/** Minimal TraceSpan with overridable fields. */
const mk = (over: Partial<TraceSpan>): TraceSpan => ({
  spanId: "s",
  parentSpanId: null,
  name: "span",
  service: "svc",
  durationMs: 1,
  timestampMs: 0,
  endTimeMs: 1,
  isError: false,
  spanKind: null,
  statusCode: null,
  isRoot: null,
  endpoint: null,
  codeFunction: null,
  codeNamespace: null,
  cpuMs: null,
  cpuSelfMs: null,
  provider: null,
  model: null,
  operation: null,
  agentName: null,
  toolName: null,
  inTokens: 0,
  outTokens: 0,
  exceptionType: null,
  exceptionMsg: null,
  workflow: null,
  tlEntity: null,
  tlEntityPath: null,
  tlKind: null,
  sessionId: null,
  mcpMethod: null,
  statusMessage: null,
  httpStatus: null,
  lgNode: null,
  lgCheckpoint: null,
  ...over,
});

describe("buildLayout — cycle safety", () => {
  // Recursive agent/MCP traces collapse to a cyclic node graph after the
  // category:label aggregation. The depth pass must terminate (it previously
  // looped forever on a longest-path relaxation, freezing the tab).
  it("terminates when the aggregated node graph has a cycle (llm ↔ tool)", () => {
    const spans: TraceSpan[] = [
      mk({ spanId: "a", parentSpanId: null, provider: "p", model: "m" }), // llm:m (entry)
      mk({ spanId: "b", parentSpanId: "a", toolName: "t" }), // tool:t  (llm:m → tool:t)
      mk({ spanId: "c", parentSpanId: "b", provider: "p", model: "m" }), // llm:m  (tool:t → llm:m) ← cycle
    ];
    const layout = buildLayout(spans, ALL_VISIBLE, "none");
    // Two aggregated nodes, two directed edges forming the cycle.
    expect(layout.nodes).toHaveLength(2);
    expect(layout.edges).toHaveLength(2);
    // Every node still gets a finite depth/position.
    for (const n of layout.nodes) expect(Number.isFinite(n.depth)).toBe(true);
  });

  it("terminates with a self-referential parent pointer", () => {
    const spans: TraceSpan[] = [
      mk({ spanId: "x", parentSpanId: "x", toolName: "t" }), // self-parent
    ];
    const layout = buildLayout(spans, ALL_VISIBLE, "none");
    expect(layout.nodes).toHaveLength(1);
  });

  it("terminates with an invisible parent cycle above a visible child", () => {
    // a ↔ b are 'other' (hidden); c (tool) hangs off a. Walking up from c to
    // find a visible ancestor must not loop on the a→b→a cycle.
    const spans: TraceSpan[] = [
      mk({ spanId: "a", parentSpanId: "b", name: "POST" }), // other
      mk({ spanId: "b", parentSpanId: "a", name: "GET" }), // other
      mk({ spanId: "c", parentSpanId: "a", toolName: "t" }), // tool
    ];
    const hideOther: IndicatorState = { ...ALL_VISIBLE, other: false };
    const layout = buildLayout(spans, hideOther, "none");
    // Only the tool node is visible; the hidden cycle is skipped, no hang.
    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0].category).toBe("tool");
  });
});
