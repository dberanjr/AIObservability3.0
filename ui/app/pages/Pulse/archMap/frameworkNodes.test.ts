import { describe, expect, it } from "vitest";
import {
  buildFrameworkNodesQuery,
  frameworkDetail,
  frameworkStatus,
  rowsToFrameworkNodes,
  type FrameworkNode,
} from "./frameworkNodes";
import type { Timeframe } from "../../../scope/types";

const TF: Timeframe = { from: "now()-2h" };

describe("buildFrameworkNodesQuery", () => {
  const q = buildFrameworkNodesQuery(null, TF);

  it("filters to the workflow population", () => {
    expect(q).toContain("isNotNull(traceloop.workflow.name)");
    expect(q).toContain("traceloop.association.properties.langgraph_node");
  });

  it("emits the if-chain framework mapping with an Other fallback", () => {
    expect(q).toContain('"LangGraph"');
    expect(q).toContain('"LangChain"');
    expect(q).toContain('else: "Other"');
    expect(q).toContain("fieldsAdd fw =");
  });

  it("ORs the LangGraph node/checkpoint extra predicate into its match", () => {
    expect(q).toContain("isNotNull(traceloop.association.properties.langgraph_node)");
    expect(q).toContain(
      "isNotNull(traceloop.association.properties.langgraph_checkpoint_ns)",
    );
  });

  it("computes the logical-error field", () => {
    expect(q).toContain("is_err = if(");
  });

  it("summarizes count / error / p90 by framework", () => {
    expect(q).toContain("n = count()");
    expect(q).toContain("err = countIf(is_err == 1)");
    expect(q).toContain("p90ns = percentile(duration, 90)");
    expect(q).toContain("by: { fw }");
  });
});

describe("rowsToFrameworkNodes", () => {
  it("maps rows, computes errorRate + p90Ms, sorts by count desc", () => {
    const nodes = rowsToFrameworkNodes([
      { fw: "LangGraph", n: 100, err: 5, p90ns: 2_000_000 },
      { fw: "Other", n: 30, err: 0, p90ns: 1_000_000 },
      { fw: "LangChain", n: 50, err: 0, p90ns: 0 },
    ]);
    expect(nodes.map((n) => n.label)).toEqual(["LangGraph", "LangChain", "Other"]);
    expect(nodes[0]).toMatchObject({ id: "langgraph", count: 100, errorRate: 0.05, p90Ms: 2 });
    expect(nodes[1]).toMatchObject({ id: "langchain", count: 50, errorRate: 0, p90Ms: 0 });
    expect(nodes[2]).toMatchObject({ id: "other", label: "Other", count: 30, p90Ms: 1 });
  });

  it("forces Other last even when its count is highest", () => {
    const nodes = rowsToFrameworkNodes([
      { fw: "Other", n: 999 },
      { fw: "LangGraph", n: 10 },
    ]);
    expect(nodes.map((n) => n.label)).toEqual(["LangGraph", "Other"]);
  });

  it("drops count-0 rows", () => {
    const nodes = rowsToFrameworkNodes([
      { fw: "LangGraph", n: 0 },
      { fw: "LangChain", n: 7 },
    ]);
    expect(nodes.map((n) => n.label)).toEqual(["LangChain"]);
  });

  it("coerces string and null values robustly", () => {
    const nodes = rowsToFrameworkNodes([
      { fw: "LangGraph", n: "20", err: "4", p90ns: "3000000" },
      { fw: "LangChain", n: null, err: null, p90ns: null },
    ]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ count: 20, errorRate: 0.2, p90Ms: 3 });
  });
});

describe("frameworkStatus", () => {
  it("is healthy when error rate and p90 are both low", () => {
    expect(frameworkStatus({ errorRate: 0.0, p90Ms: 100 })).toBe("healthy");
  });
  it("warns at the error-rate warning threshold", () => {
    expect(frameworkStatus({ errorRate: 0.05, p90Ms: 100 })).toBe("warning");
  });
  it("goes critical at the error-rate critical threshold", () => {
    expect(frameworkStatus({ errorRate: 0.2, p90Ms: 100 })).toBe("critical");
  });
  it("takes the worse of error and latency status", () => {
    // low error, but p90 over the critical latency threshold → critical
    expect(frameworkStatus({ errorRate: 0.0, p90Ms: 6000 })).toBe("critical");
    expect(frameworkStatus({ errorRate: 0.0, p90Ms: 3000 })).toBe("warning");
  });
});

describe("frameworkDetail", () => {
  const fws: FrameworkNode[] = [
    { id: "langgraph", label: "LangGraph", count: 75, errorRate: 0.12, p90Ms: 2500 },
    { id: "langchain", label: "LangChain", count: 25, errorRate: 0.0, p90Ms: 100 },
  ];

  it("computes share over the total and derives severity from error rate", () => {
    const d = frameworkDetail("langgraph", fws);
    expect(d).not.toBeNull();
    expect(d!.label).toBe("LangGraph");
    expect(d!.count).toBe(75);
    expect(d!.share).toBeCloseTo(75, 5);
    expect(d!.severity).toBe("critical"); // 0.12 ≥ crit
  });

  it("returns info severity for a healthy framework", () => {
    expect(frameworkDetail("langchain", fws)!.severity).toBe("info");
    expect(frameworkDetail("langchain", fws)!.share).toBeCloseTo(25, 5);
  });

  it("returns null when the id is not found", () => {
    expect(frameworkDetail("crewai", fws)).toBeNull();
  });

  it("treats a zero total as 0% share without dividing by zero", () => {
    const d = frameworkDetail("langgraph", [
      { id: "langgraph", label: "LangGraph", count: 0, errorRate: 0, p90Ms: 0 },
    ]);
    expect(d!.share).toBe(0);
  });
});
