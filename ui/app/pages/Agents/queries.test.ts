import { describe, expect, it } from "vitest";
import {
  buildAgentLatestTraceQuery,
  buildAgentsQuery,
  buildAgentToolTracesQuery,
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

  it("guards the MCP-lifecycle exclusion with a null tolerance (regression: bare AND chain misclassified non-MCP tool spans as orch)", () => {
    expect(q).toContain("isNull(mcp.method.name) or");
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

  it("guards the MCP-lifecycle exclusion with a null tolerance (regression: bare AND chain misclassified non-MCP tool spans as orch)", () => {
    const q = buildLatencyDecompositionQuery(null, TF);
    expect(q).toContain("isNull(mcp.method.name) or");
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

describe("buildAgentToolTracesQuery — candidate traces per agent+tool", () => {
  it("scopes to the agent name like buildAgentToolDetailQuery", () => {
    const q = buildAgentToolTracesQuery(null, TF, "my-agent", "my_tool", false);
    expect(q).toContain("isNotNull(gen_ai.agent.name)");
    expect(q).toContain('gen_ai.agent.name == "my-agent"');
  });

  it("strict mode matches the tool on gen_ai.tool.name", () => {
    const q = buildAgentToolTracesQuery(null, TF, "my-agent", "my_tool", true);
    expect(q).toContain("isNotNull(gen_ai.tool.name)");
    expect(q).toContain('gen_ai.tool.name == "my_tool"');
  });

  it("discovered mode matches the tool on span.name with the same exclusions", () => {
    const q = buildAgentToolTracesQuery(null, TF, "my-agent", "my_tool", false);
    expect(q).toContain('span.kind == "internal" or span.kind == "client"');
    expect(q).toContain(
      "isNull(gen_ai.provider.name) and isNull(gen_ai.request.model)",
    );
    expect(q).toContain("isNull(mcp.method.name) or");
    expect(q).toContain('span.name == "my_tool"');
  });

  it("summarizes per trace with named fields", () => {
    const q = buildAgentToolTracesQuery(null, TF, "my-agent", "my_tool", false);
    expect(q).toContain("by: { trace.id }");
    expect(q).toContain("dur_ms = max(duration) / 1000000");
    expect(q).toContain("start_ms = toLong(min(start_time)) / 1000000");
    expect(q).toContain("calls = count()");
    // is_error: any errored span in the trace makes the trace errored.
    expect(q).toContain("is_error = if(countIf(");
  });

  it("stringifies trace.id and projects the candidate fields", () => {
    const q = buildAgentToolTracesQuery(null, TF, "my-agent", "my_tool", false);
    expect(q).toContain("trace_id = toString(trace.id)");
    expect(q).toContain("fields trace_id, start_ms, dur_ms, is_error, calls");
  });

  it("sorts by recency and caps the candidate pool at 200", () => {
    const q = buildAgentToolTracesQuery(null, TF, "my-agent", "my_tool", false);
    expect(q).toContain("sort start_ms desc");
    expect(q).toContain("| limit 200");
  });
});
