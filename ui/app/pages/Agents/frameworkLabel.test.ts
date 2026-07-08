import { describe, expect, it } from "vitest";
import { resolveAgentFramework } from "./frameworkLabel";

describe("resolveAgentFramework", () => {
  it("labels LangGraph from the workflow name", () => {
    expect(resolveAgentFramework({ fw_workflow: "LangGraph" })).toBe("LangGraph");
  });
  it("labels CrewAI from gen_ai.system but never from openai", () => {
    expect(resolveAgentFramework({ fw_system: "crewai" })).toBe("CrewAI");
    expect(resolveAgentFramework({ fw_system: "openai" })).toBe(null);
  });
  it("returns null when unknown", () => {
    expect(resolveAgentFramework({})).toBe(null);
  });
});
