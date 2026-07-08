import { describe, expect, it } from "vitest";
import { buildAgentToolDetailQuery, buildDiscoveredToolsQuery } from "./queries";
import type { Timeframe } from "../../scope/types";

const TF: Timeframe = { from: "now()-2h" };

describe("buildDiscoveredToolsQuery — MCP lifecycle exclusion", () => {
  const q = buildDiscoveredToolsQuery(null, TF);

  it("excludes MCP protocol lifecycle calls from discovered tools", () => {
    expect(q).toContain('mcp.method.name != "tools/list"');
    expect(q).toContain('mcp.method.name != "initialize"');
    expect(q).toContain('mcp.method.name != "notifications/initialized"');
    expect(q).toContain('mcp.method.name != "ping"');
  });

  it("still excludes the agent root and LLM spans", () => {
    expect(q).toContain("span.name != gen_ai.agent.name");
    expect(q).toContain("isNull(gen_ai.provider.name)");
  });
});

describe("buildAgentToolDetailQuery — strict vs discovered mode", () => {
  const nonStrict = buildAgentToolDetailQuery(null, TF, "my-agent", "my-tool", 60, false);
  const strict = buildAgentToolDetailQuery(null, TF, "my-agent", "my-tool", 60, true);

  it("applies the MCP lifecycle filter in non-strict (discovered) mode", () => {
    expect(nonStrict).toContain('mcp.method.name != "tools/list"');
  });

  it("omits the MCP lifecycle filter in strict mode (uses isNotNull(gen_ai.tool.name))", () => {
    expect(strict).not.toContain('mcp.method.name != "tools/list"');
    expect(strict).toContain("isNotNull(gen_ai.tool.name)");
  });
});
