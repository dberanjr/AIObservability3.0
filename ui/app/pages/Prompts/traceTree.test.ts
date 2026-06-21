import { describe, expect, it } from "vitest";
import { spanCategory } from "./TraceTree";
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
