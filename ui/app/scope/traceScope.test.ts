import { describe, expect, it } from "vitest";
import {
  buildTraceScopeQuery,
  FRAMEWORK_FILTER_VALUES,
  frameworkPredicate,
  hasActiveFilter,
  injectTraceScope,
  validConditions,
} from "./queries";
import type { GlobalFilters } from "./queries";
import { FRAMEWORK_LABEL } from "../detection/attributes";

const TF = { from: "now()-24h" };

describe("buildTraceScopeQuery", () => {
  it("resolves a single condition per-trace (countIf + having)", () => {
    const f: GlobalFilters = {
      conditions: [{ attribute: "gen_ai.agent.name", values: ["alpha"] }],
    };
    const q = buildTraceScopeQuery(TF, f, 25000);
    expect(q).toContain(
      'c0 = countIf(in(toString(gen_ai.agent.name), array("alpha")))',
    );
    expect(q).toContain("by: { trace.id }");
    expect(q).toContain("| filter c0 > 0");
    // trace.id is a uid column — resolver emits it as a plain string.
    expect(q).toContain("| fields trace_id = toString(trace.id)");
    // cap+1 so the caller can detect truncation.
    expect(q).toContain("| limit 25001");
  });

  it("ANDs conditions across the trace, ORs values within a condition", () => {
    const f: GlobalFilters = {
      conditions: [
        { attribute: "gen_ai.agent.name", values: ["alpha", "beta"] },
        { attribute: "gen_ai.request.model", values: ["gpt-4o"] },
      ],
    };
    const q = buildTraceScopeQuery(TF, f, 5000);
    // OR within a condition: both values in one array.
    expect(q).toContain(
      'in(toString(gen_ai.agent.name), array("alpha", "beta"))',
    );
    // AND across conditions: every counter must be positive.
    expect(q).toContain("| filter c0 > 0 and c1 > 0");
    // Pre-filter narrows the scan to spans matching ANY condition.
    expect(q).toContain(
      'in(toString(gen_ai.agent.name), array("alpha", "beta")) or in(toString(gen_ai.request.model), array("gpt-4o"))',
    );
  });

  it("omits the limit for an uncapped (exact) resolve", () => {
    const f: GlobalFilters = {
      conditions: [{ attribute: "gen_ai.provider.name", values: ["openai"] }],
    };
    const q = buildTraceScopeQuery(TF, f, Infinity);
    expect(q).not.toContain("| limit");
  });

  it("resolves the frameworks dimension as its own predicate arm", () => {
    const f: GlobalFilters = {
      conditions: [],
      frameworks: ["LangGraph", "CrewAI"],
    };
    const q = buildTraceScopeQuery(TF, f, 5000);
    // wf-arm OR system-arm, both inside one parenthesised predicate.
    expect(q).toContain(
      'c0 = countIf((in(toString(traceloop.workflow.name), array("LangGraph")) or in(toString(gen_ai.system), array("crewai"))))',
    );
    expect(q).toContain("| filter c0 > 0");
  });

  it("ANDs the frameworks dimension with attribute conditions across the trace", () => {
    const f: GlobalFilters = {
      conditions: [{ attribute: "gen_ai.request.model", values: ["gpt-4o"] }],
      frameworks: ["LangGraph"],
    };
    const q = buildTraceScopeQuery(TF, f, 5000);
    // Condition is c0, frameworks is c1 — both must be positive.
    expect(q).toContain("| filter c0 > 0 and c1 > 0");
  });
});

describe("frameworkPredicate", () => {
  it("returns '' for no labels or only unmappable labels", () => {
    expect(frameworkPredicate(undefined)).toBe("");
    expect(frameworkPredicate([])).toBe("");
    expect(frameworkPredicate(["Nonexistent"])).toBe("");
  });

  it("emits a workflow-name arm for a wf-only framework", () => {
    expect(frameworkPredicate(["LangGraph"])).toBe(
      '(in(toString(traceloop.workflow.name), array("LangGraph")))',
    );
  });

  it("emits a system arm for a system-only framework", () => {
    expect(frameworkPredicate(["CrewAI"])).toBe(
      '(in(toString(gen_ai.system), array("crewai")))',
    );
  });

  it("ORs the two arms for a framework spanning both attributes", () => {
    expect(frameworkPredicate(["LangChain"])).toBe(
      '(in(toString(traceloop.workflow.name), array("RunnableSequence", "AgentExecutor")) or in(toString(gen_ai.system), array("langchain")))',
    );
  });

  it("merges signal values across multiple selected labels", () => {
    expect(frameworkPredicate(["LangGraph", "CrewAI"])).toBe(
      '(in(toString(traceloop.workflow.name), array("LangGraph")) or in(toString(gen_ai.system), array("crewai")))',
    );
  });

  it("keys FRAMEWORK_FILTER_VALUES only by valid framework labels", () => {
    // A typo'd key would silently never match a chip (chips carry FRAMEWORK_LABEL
    // values), so every key must be a known label.
    Object.keys(FRAMEWORK_FILTER_VALUES).forEach((k) =>
      expect(Object.values(FRAMEWORK_LABEL)).toContain(k),
    );
  });
});

describe("hasActiveFilter", () => {
  it("is false for an empty filter", () => {
    expect(hasActiveFilter({ conditions: [] })).toBe(false);
    expect(hasActiveFilter(undefined)).toBe(false);
  });

  it("is true when a valid attribute condition is present", () => {
    expect(
      hasActiveFilter({
        conditions: [{ attribute: "gen_ai.agent.name", values: ["a"] }],
      }),
    ).toBe(true);
  });

  it("is true when a mappable framework is selected", () => {
    expect(hasActiveFilter({ conditions: [], frameworks: ["LangGraph"] })).toBe(
      true,
    );
  });

  it("ignores unmappable framework labels", () => {
    expect(hasActiveFilter({ conditions: [], frameworks: ["Nope"] })).toBe(
      false,
    );
  });
});

describe("injectTraceScope", () => {
  const Q = "fetch spans, samplingRatio: 1, from: now()-24h\n| summarize count()";

  it("returns the query unchanged when no filter is active (null)", () => {
    expect(injectTraceScope(Q, null)).toBe(Q);
  });

  it("injects a uid-wrapped trace.id filter after the fetch when ids are present", () => {
    const out = injectTraceScope(Q, ["t1", "t2"]);
    // trace.id is a uid column — ids must be wrapped in toUid(...).
    expect(out).toContain('| filter in(trace.id, array(toUid("t1"), toUid("t2")))');
    // Inserted right after the fetch, before the existing summarize pipe.
    expect(out.indexOf("trace.id")).toBeLessThan(out.indexOf("summarize"));
  });

  it("injects an all-zero uid sentinel when the filter resolves to zero traces", () => {
    const out = injectTraceScope(Q, []);
    expect(out).toContain('toUid("00000000000000000000000000000000")');
  });

  it("scopes every fetch spans/logs, including a nested span fetch", () => {
    const multi =
      "fetch spans, from: now()-1h\n| join [\n    fetch spans, from: now()-1h\n    | fields trace.id\n  ], on: { trace.id }";
    const out = injectTraceScope(multi, ["t1"]);
    expect(
      out.match(/\| filter in\(trace\.id, array\(toUid\("t1"\)\)\)/g),
    ).toHaveLength(2);
  });

  it("does not touch non-span/log fetches (no trace.id there)", () => {
    const entity = "fetch dt.entity.service\n| fields id";
    expect(injectTraceScope(entity, ["t1"])).toBe(entity);
  });

  it("escapes quotes in trace ids", () => {
    const out = injectTraceScope(Q, ['ab"cd']);
    expect(out).toContain('toUid("ab\\"cd")');
  });
});

describe("validConditions", () => {
  it("drops malformed attributes and empty value lists", () => {
    const f: GlobalFilters = {
      conditions: [
        { attribute: "gen_ai.agent.name", values: ["ok"] },
        { attribute: "bad attr!", values: ["x"] },
        { attribute: "gen_ai.request.model", values: [] },
      ],
    };
    const out = validConditions(f);
    expect(out).toHaveLength(1);
    expect(out[0].attribute).toBe("gen_ai.agent.name");
  });
});
