import { describe, expect, it } from "vitest";
import {
  buildAgentLatestTraceQuery,
  buildAgentsQuery,
  buildLatencyDecompositionQuery,
} from "./queries";
import type { Timeframe } from "../../scope/types";

const TF: Timeframe = { from: "now()-2h" };

describe("buildAgentsQuery — authoritative tool classification", () => {
  const q = buildAgentsQuery(null, TF);

  it("classifies tools by traceloop.span.kind / gen_ai.tool.name / mcp tools-call", () => {
    expect(q).toContain('traceloop.span.kind == "tool"');
    expect(q).toContain("isNotNull(gen_ai.tool.name)");
    expect(q).toContain('mcp.method.name == "tools/call"');
  });

  it("does NOT use span.kind==client or _tool name inference as a tool signal", () => {
    expect(q).not.toContain('span.kind == "client" or contains(lname,"_tool")');
  });

  it("excludes MCP lifecycle methods from tools", () => {
    expect(q).toContain('mcp.method.name != "tools/list"');
    expect(q).toContain('mcp.method.name != "initialize"');
    expect(q).toContain('mcp.method.name != "notifications/initialized"');
    expect(q).toContain('mcp.method.name != "ping"');
  });
});

describe("buildAgentsQuery — framework signals", () => {
  it("collects traceloop workflow/entity + gen_ai.system instead of the empty gen_ai.framework", () => {
    const q = buildAgentsQuery(null, TF);
    expect(q).toContain("fw_workflow = takeFirst(traceloop.workflow.name)");
    expect(q).toContain("fw_entity = takeFirst(traceloop.entity.name)");
    expect(q).toContain("fw_system = takeFirst(gen_ai.system)");
    expect(q).toContain("fw_span = takeFirst(span.name)");
    expect(q).not.toContain("framework = takeFirst(gen_ai.framework)");
  });
});

describe("buildLatencyDecompositionQuery — tool tier", () => {
  it("uses the same authoritative tool signal", () => {
    const q = buildLatencyDecompositionQuery(null, TF);
    expect(q).toContain('traceloop.span.kind == "tool"');
    expect(q).not.toContain('span.kind == "client" or contains(lname,"_tool")');
  });

  it("excludes MCP lifecycle methods from tools", () => {
    const q = buildLatencyDecompositionQuery(null, TF);
    expect(q).toContain('mcp.method.name != "tools/list"');
    expect(q).toContain('mcp.method.name != "initialize"');
    expect(q).toContain('mcp.method.name != "notifications/initialized"');
    expect(q).toContain('mcp.method.name != "ping"');
  });
});

describe("buildAgentLatestTraceQuery — trace-topology seed", () => {
  const q = buildAgentLatestTraceQuery(null, TF, "my-agent");

  it("stringifies the trace.id uid column for the trace_id column", () => {
    expect(q).toContain("toString(trace.id)");
  });

  it("converts the ns start_time to epoch ms", () => {
    expect(q).toContain("toLong(ts) / 1000000");
  });

  it("filters on the escaped agent name", () => {
    expect(q).toContain('gen_ai.agent.name == "my-agent"');
  });

  it("summarizes the latest start_time and takes a single trace", () => {
    expect(q).toContain("ts = max(start_time)");
    expect(q).toContain("| limit 1");
  });
});
