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
  attributes: {},
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

// Node keys come from nodeOf: agent label = workflow??tlEntity??name (category
// requires agentName or tlKind==="workflow"); tool label = tlEntity??name
// (category requires tlKind==="tool" or toolName). We set tlEntity/name to
// control the aggregation key, and tlKind to control the category.
const agentRoot = (over: Partial<TraceSpan>): TraceSpan =>
  mk({ tlKind: "workflow", workflow: "agent_graph", ...over });
const toolSpan = (label: string, over: Partial<TraceSpan>): TraceSpan =>
  mk({ tlKind: "tool", tlEntity: label, toolName: label, ...over });

describe("buildLayout — entry detection (Fix A)", () => {
  // Core regression: a node whose grouped spans include BOTH an orphan instance
  // (parent points to a missing id) AND a properly-parented instance must NOT
  // be an entry. The old code marked it entry on the orphan and seeded it at
  // depth 0 (far left); now entry = no incoming edge, so it stays downstream.
  it("an orphan+parented node is downstream, not an entry", () => {
    const spans: TraceSpan[] = [
      agentRoot({ spanId: "root", parentSpanId: null }), // agent:agent_graph (true entry)
      toolSpan("tools.task", { spanId: "task", parentSpanId: "root" }), // tool:tools.task
      // First instance of the tool node: properly parented under tools.task.
      toolSpan("search_aims", { spanId: "tool1", parentSpanId: "task" }),
      // Second instance of the SAME node: data-orphan (parent id absent).
      toolSpan("search_aims", { spanId: "tool2", parentSpanId: "missing-id" }),
    ];
    const layout = buildLayout(spans, ALL_VISIBLE, "none");
    const byKey = new Map(layout.nodes.map((n) => [n.key, n]));
    const search = byKey.get("tool:search_aims")!;
    expect(search).toBeDefined();
    // Has a real incoming edge from tools.task → NOT an entry, depth > 0.
    expect(search.isEntry).toBe(false);
    expect(search.depth).toBeGreaterThan(0);
    expect(
      layout.edges.some(
        (e) => e.from === "tool:tools.task" && e.to === "tool:search_aims",
      ),
    ).toBe(true);
    // The genuine root is the only entry.
    expect(byKey.get("agent:agent_graph")!.isEntry).toBe(true);
  });

  it("a node with no incoming edge remains an entry (genuine orphan)", () => {
    const spans: TraceSpan[] = [
      agentRoot({ spanId: "root", parentSpanId: null }),
      toolSpan("lonely", { spanId: "orphan", parentSpanId: "missing" }),
    ];
    const layout = buildLayout(spans, ALL_VISIBLE, "none");
    const byKey = new Map(layout.nodes.map((n) => [n.key, n]));
    expect(byKey.get("tool:lonely")!.isEntry).toBe(true);
    expect(byKey.get("tool:lonely")!.depth).toBe(0);
  });
});

describe("buildLayout — root totals (Fix B)", () => {
  it("only the true-root node is in rootKeys, even when other nodes are entries", () => {
    const spans: TraceSpan[] = [
      agentRoot({ spanId: "root", parentSpanId: null }), // true root
      toolSpan("tools.task", { spanId: "task", parentSpanId: "root" }),
      toolSpan("search_aims", { spanId: "tool", parentSpanId: "task" }),
      toolSpan("lonely", { spanId: "orphan", parentSpanId: "missing" }), // entry but NOT root
    ];
    const layout = buildLayout(spans, ALL_VISIBLE, "none");
    expect(layout.rootKeys.has("agent:agent_graph")).toBe(true);
    expect(layout.rootKeys.has("tool:lonely")).toBe(false);
    // The orphan IS a layout entry but must not be flagged root.
    const byKey = new Map(layout.nodes.map((n) => [n.key, n]));
    expect(byKey.get("tool:lonely")!.isEntry).toBe(true);
    expect(layout.rootKeys.size).toBe(1);
  });

  it("isRoot=true span (non-null parent) is still a root node", () => {
    const spans: TraceSpan[] = [
      agentRoot({ spanId: "r", parentSpanId: "external", isRoot: true }),
    ];
    const layout = buildLayout(spans, ALL_VISIBLE, "none");
    expect(layout.rootKeys.has("agent:agent_graph")).toBe(true);
  });
});

describe("buildLayout — error flag (Fix C)", () => {
  it("a node with any errored grouped span has isError true; clean node false", () => {
    const spans: TraceSpan[] = [
      agentRoot({ spanId: "root", parentSpanId: null }), // clean
      toolSpan("boom", { spanId: "t1", parentSpanId: "root" }), // clean instance
      toolSpan("boom", { spanId: "t2", parentSpanId: "root", isError: true }), // errored
    ];
    const layout = buildLayout(spans, ALL_VISIBLE, "none");
    const byKey = new Map(layout.nodes.map((n) => [n.key, n]));
    expect(byKey.get("tool:boom")!.isError).toBe(true);
    expect(byKey.get("agent:agent_graph")!.isError).toBe(false);
  });
});
