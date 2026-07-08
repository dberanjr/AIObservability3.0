import { describe, expect, it } from "vitest";
import { buildFrameworkBreakdownQuery, rowsToFrameworks } from "./frameworkBreakdown";
import type { Timeframe } from "../../../scope/types";

const TF: Timeframe = { from: "now()-2h" };

describe("buildFrameworkBreakdownQuery", () => {
  const q = buildFrameworkBreakdownQuery(null, TF);
  it("groups by the raw framework signals", () => {
    expect(q).toContain("traceloop.workflow.name");
    expect(q).toContain("gen_ai.system");
    expect(q).toContain("n = count()");
  });
});

describe("rowsToFrameworks", () => {
  it("aggregates raw rows into labeled, deduped frameworks with counts", () => {
    const rows = [
      { wf: "LangGraph", system: null, n: 100 },
      { wf: "RunnableSequence", system: null, n: 20 },
      { wf: null, system: "crewai", n: 5 },
      { wf: null, system: "openai", n: 999 },
    ];
    const fw = rowsToFrameworks(rows);
    const byLabel = Object.fromEntries(fw.map((f) => [f.label, f.count]));
    expect(byLabel["LangGraph"]).toBe(100);
    expect(byLabel["LangChain"]).toBe(20);
    expect(byLabel["CrewAI"]).toBe(5);
    expect(byLabel["OpenAI"]).toBeUndefined();
    expect(byLabel["Unknown"]).toBeUndefined();
  });

  it("detects framework from the entity field (LlamaIndex)", () => {
    const fw = rowsToFrameworks([{ entity: "llama_index.query", n: 30 }]);
    expect(fw).toHaveLength(1);
    expect(fw[0].label).toBe("LlamaIndex");
    expect(fw[0].count).toBe(30);
  });

  it("folds multiple rows resolving to the same framework", () => {
    const fw = rowsToFrameworks([
      { wf: "LangGraph", n: 10 },
      { wf: "LangGraph", n: 5 },
    ]);
    expect(fw).toHaveLength(1);
    expect(fw[0].label).toBe("LangGraph");
    expect(fw[0].count).toBe(15);
  });

  it("sorts by count descending", () => {
    const fw = rowsToFrameworks([
      { wf: "RunnableSequence", system: null, n: 1 },
      { wf: "LangGraph", system: null, n: 50 },
    ]);
    expect(fw[0].label).toBe("LangGraph");
  });
});
