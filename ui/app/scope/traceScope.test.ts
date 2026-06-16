import { describe, expect, it } from "vitest";
import {
  buildTraceScopeQuery,
  injectTraceScope,
  validConditions,
} from "./queries";
import type { GlobalFilters } from "./queries";

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
