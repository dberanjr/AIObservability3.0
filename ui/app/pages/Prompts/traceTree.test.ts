import { describe, expect, it } from "vitest";
import {
  spanCategory,
  markErrors,
  defaultOpenSections,
  type TreeNode,
} from "./TraceTree";
import type { TraceSpan } from "./useTraceSpans";

const base: TraceSpan = {
  spanId: "s",
  parentSpanId: null,
  name: "",
  service: "",
  durationMs: 0,
  timestampMs: 0,
  endTimeMs: null,
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
};

describe("spanCategory — tool classification", () => {
  it("treats traceloop.span.kind=tool and gen_ai.tool.name as tools", () => {
    expect(spanCategory({ ...base, tlKind: "tool" })).toBe("tool");
    expect(spanCategory({ ...base, toolName: "search_jira_issues" })).toBe("tool");
  });

  it("treats a real MCP tools/call as a tool", () => {
    expect(
      spanCategory({ ...base, name: "tools/call GetEmails", mcpMethod: "tools/call" }),
    ).toBe("tool");
  });

  it("does NOT treat traceloop.span.kind=task as a tool (it's orchestration)", () => {
    expect(spanCategory({ ...base, name: "continue_to_summarize", tlKind: "task" })).toBe(
      "other",
    );
  });

  it("does NOT treat MCP lifecycle as a tool", () => {
    expect(spanCategory({ ...base, name: "tools/list", mcpMethod: "tools/list" })).toBe(
      "other",
    );
    expect(spanCategory({ ...base, name: "initialize", mcpMethod: "initialize" })).toBe(
      "other",
    );
  });

  it("still classifies provider spans as llm and agent/workflow as agent", () => {
    expect(spanCategory({ ...base, provider: "openai" })).toBe("llm");
    expect(spanCategory({ ...base, tlKind: "workflow" })).toBe("agent");
  });
});

// Minimal {span, children} tree builder for the error-marking tests.
const sp = (spanId: string, isError = false): TraceSpan => ({
  ...base,
  spanId,
  isError,
});
const tn = (
  spanId: string,
  isError: boolean,
  children: { span: TraceSpan; children: unknown[] }[] = [],
): { span: TraceSpan; children: unknown[] } => ({
  span: sp(spanId, isError),
  children,
});

const byId = (roots: TreeNode[]): Map<string, TreeNode> => {
  const m = new Map<string, TreeNode>();
  const walk = (n: TreeNode) => {
    m.set(n.span.spanId, n);
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return m;
};

describe("defaultOpenSections — which attribute sections start expanded", () => {
  it("opens the AI namespace groups + Core by default, but not Error", () => {
    const open = defaultOpenSections(base);
    expect(open.has("Core")).toBe(true);
    // AI/OpenLLMetry groups are expanded by default.
    expect(open.has("Gen ai")).toBe(true);
    expect(open.has("Llm")).toBe(true);
    expect(open.has("Traceloop")).toBe(true);
    expect(open.has("Error")).toBe(false);
  });

  it("also opens the Error section when the span is errored", () => {
    const open = defaultOpenSections({ ...base, isError: true });
    expect(open.has("Error")).toBe(true);
    expect(open.has("Core")).toBe(true);
  });
});

describe("markErrors — error propagation up the tree", () => {
  it("flags an errored leaf and propagates hasErrorDescendant to ancestors", () => {
    //  root → mid → leaf(ERROR), with a sibling clean branch
    const tree = [
      tn("root", false, [
        tn("mid", false, [tn("leaf", true)]),
        tn("clean", false, [tn("cleanLeaf", false)]),
      ]),
    ] as unknown as TreeNode[];

    const marked = markErrors(tree);
    const m = byId(marked);

    // The errored leaf is flagged isError but has no errored descendant.
    expect(m.get("leaf")!.isError).toBe(true);
    expect(m.get("leaf")!.hasErrorDescendant).toBe(false);

    // Ancestors of the error get hasErrorDescendant, but are not themselves errored.
    expect(m.get("mid")!.isError).toBe(false);
    expect(m.get("mid")!.hasErrorDescendant).toBe(true);
    expect(m.get("root")!.isError).toBe(false);
    expect(m.get("root")!.hasErrorDescendant).toBe(true);

    // The unrelated branch stays clean.
    expect(m.get("clean")!.isError).toBe(false);
    expect(m.get("clean")!.hasErrorDescendant).toBe(false);
    expect(m.get("cleanLeaf")!.isError).toBe(false);
    expect(m.get("cleanLeaf")!.hasErrorDescendant).toBe(false);
  });

  it("an errored span with an errored descendant gets both flags", () => {
    const tree = [tn("a", true, [tn("b", true)])] as unknown as TreeNode[];
    const m = byId(markErrors(tree));
    expect(m.get("a")!.isError).toBe(true);
    expect(m.get("a")!.hasErrorDescendant).toBe(true);
    expect(m.get("b")!.isError).toBe(true);
    expect(m.get("b")!.hasErrorDescendant).toBe(false);
  });

  it("leaves an all-clean tree with no flags set", () => {
    const tree = [tn("x", false, [tn("y", false)])] as unknown as TreeNode[];
    const m = byId(markErrors(tree));
    for (const n of m.values()) {
      expect(n.isError).toBe(false);
      expect(n.hasErrorDescendant).toBe(false);
    }
  });
});
