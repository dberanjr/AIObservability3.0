import { describe, expect, it } from "vitest";
import {
  buildTraceScopeQuery,
  hasActiveFilter,
  injectGlobalFilters,
  injectTraceScope,
  mcpNotLifecycleClause,
  MCP_LIFECYCLE_METHODS,
  partitionConditions,
  SAFE_TRACE_CAP,
  TRACE_SCOPED_ATTRS,
  validConditions,
} from "./queries";
import type { GlobalFilters } from "./queries";

describe("injectGlobalFilters (direct condition injection)", () => {
  const SPANS = "fetch spans, samplingRatio: 1, from: now()-24h\n| summarize count()";
  const LOGS = "fetch logs, from: now()-1h\n| fields content";

  it("emits one in(toString(attr), array(...)) pipe for a single condition", () => {
    const f: GlobalFilters = {
      conditions: [
        { attribute: "gen_ai.request.model", values: ["m1", "m2"] },
      ],
    };
    const out = injectGlobalFilters(SPANS, f);
    expect(out).toContain(
      '| filter in(toString(gen_ai.request.model), array("m1", "m2"))',
    );
  });

  it("OR-joins values within a condition (single array literal)", () => {
    const f: GlobalFilters = {
      conditions: [{ attribute: "gen_ai.agent.name", values: ["alpha", "beta"] }],
    };
    const out = injectGlobalFilters(SPANS, f);
    expect(out).toContain(
      '| filter in(toString(gen_ai.agent.name), array("alpha", "beta"))',
    );
  });

  it("ANDs multiple conditions as separate filter pipes", () => {
    const f: GlobalFilters = {
      conditions: [
        { attribute: "gen_ai.request.model", values: ["gpt-4o"] },
        { attribute: "dt.entity.service", values: ["SERVICE-1"] },
      ],
    };
    const out = injectGlobalFilters(SPANS, f);
    expect(out).toContain('| filter in(toString(gen_ai.request.model), array("gpt-4o"))');
    expect(out).toContain('| filter in(toString(dt.entity.service), array("SERVICE-1"))');
    // Two distinct pipes (one per condition) ⇒ logical AND.
    expect(out.match(/\| filter in\(toString\(/g)).toHaveLength(2);
  });

  it("inserts the pipes immediately after the fetch, before existing pipes", () => {
    const f: GlobalFilters = {
      conditions: [{ attribute: "gen_ai.request.model", values: ["m1"] }],
    };
    const out = injectGlobalFilters(SPANS, f);
    expect(out.indexOf("in(toString(gen_ai.request.model)")).toBeLessThan(
      out.indexOf("summarize"),
    );
  });

  it("injects after a fetch logs statement too", () => {
    const f: GlobalFilters = {
      conditions: [{ attribute: "gen_ai.agent.name", values: ["a"] }],
    };
    const out = injectGlobalFilters(LOGS, f);
    expect(out).toContain('| filter in(toString(gen_ai.agent.name), array("a"))');
    expect(out.indexOf("in(toString")).toBeLessThan(out.indexOf("fields content"));
  });

  it("scopes every span fetch, including a nested span fetch in a join", () => {
    const multi =
      "fetch spans, from: now()-1h\n| join [\n    fetch spans, from: now()-1h\n    | fields trace.id\n  ], on: { trace.id }";
    const f: GlobalFilters = {
      conditions: [{ attribute: "gen_ai.request.model", values: ["m1"] }],
    };
    const out = injectGlobalFilters(multi, f);
    expect(
      out.match(/\| filter in\(toString\(gen_ai\.request\.model\), array\("m1"\)\)/g),
    ).toHaveLength(2);
  });

  it("no-ops when no condition is active (query + key stay stable)", () => {
    expect(injectGlobalFilters(SPANS, { conditions: [] })).toBe(SPANS);
    expect(injectGlobalFilters(SPANS, undefined)).toBe(SPANS);
  });

  it("drops malformed attribute conditions before emitting", () => {
    const f: GlobalFilters = {
      conditions: [{ attribute: "bad attr!", values: ["x"] }],
    };
    expect(injectGlobalFilters(SPANS, f)).toBe(SPANS);
  });

  it("escapes quotes in values", () => {
    const f: GlobalFilters = {
      conditions: [{ attribute: "gen_ai.request.model", values: ['ab"cd'] }],
    };
    const out = injectGlobalFilters(SPANS, f);
    expect(out).toContain('array("ab\\"cd")');
  });

  it("does not touch non-span/log fetches (no AI attributes there)", () => {
    const entity = "fetch dt.entity.service\n| fields id";
    const f: GlobalFilters = {
      conditions: [{ attribute: "gen_ai.request.model", values: ["m1"] }],
    };
    expect(injectGlobalFilters(entity, f)).toBe(entity);
  });
});

describe("TRACE_SCOPED_ATTRS", () => {
  it("contains the low-volume cross-span entity attributes", () => {
    expect(TRACE_SCOPED_ATTRS.has("gen_ai.agent.name")).toBe(true);
    expect(TRACE_SCOPED_ATTRS.has("gen_ai.tool.name")).toBe(true);
  });

  it("deliberately excludes high-cardinality / same-span attributes", () => {
    // These resolve to huge trace sets and live on the same span as the data
    // pages query, so they go through DIRECT injection (uncapped, no crash).
    expect(TRACE_SCOPED_ATTRS.has("gen_ai.request.model")).toBe(false);
    expect(TRACE_SCOPED_ATTRS.has("dt.entity.service")).toBe(false);
    expect(TRACE_SCOPED_ATTRS.has("gen_ai.provider.name")).toBe(false);
    expect(TRACE_SCOPED_ATTRS.has("span.status_code")).toBe(false);
  });
});

describe("SAFE_TRACE_CAP", () => {
  it("stays under the 250 sub-expressions-per-expression DQL limit", () => {
    // injectTraceScope emits a single `in(trace.id, array(toUid×N))` expression;
    // DQL caps sub-expressions per expression at 250 (verified on ualpre:
    // toUid×256 throws EXPRESSION_TOO_MANY_SUB_EXPRESSIONS). The cap must leave
    // room for array()/in()/field-ref overhead, so keep it a few below 248.
    expect(Number.isFinite(SAFE_TRACE_CAP)).toBe(true);
    expect(SAFE_TRACE_CAP).toBeGreaterThanOrEqual(100);
    expect(SAFE_TRACE_CAP).toBeLessThanOrEqual(245);
  });
});

describe("injectTraceScope sub-expression safety", () => {
  it("hard-caps injected ids at SAFE_TRACE_CAP even if handed more", () => {
    const tooMany = Array.from({ length: 500 }, (_, i) =>
      i.toString(16).padStart(32, "0"),
    );
    const out = injectTraceScope("fetch spans", tooMany);
    const toUidCount = (out.match(/toUid\(/g) ?? []).length;
    expect(toUidCount).toBe(SAFE_TRACE_CAP);
    expect(toUidCount).toBeLessThan(250);
  });
});

describe("partitionConditions", () => {
  it("routes agent/tool to scope and everything else to direct", () => {
    const conditions = [
      { attribute: "gen_ai.agent.name", values: ["a"] },
      { attribute: "gen_ai.tool.name", values: ["t"] },
      { attribute: "gen_ai.request.model", values: ["m"] },
      { attribute: "dt.entity.service", values: ["s"] },
      { attribute: "span.status_code", values: ["error"] },
    ];
    const { direct, scope } = partitionConditions(conditions);
    expect(scope.map((c) => c.attribute).sort()).toEqual([
      "gen_ai.agent.name",
      "gen_ai.tool.name",
    ]);
    expect(direct.map((c) => c.attribute).sort()).toEqual([
      "dt.entity.service",
      "gen_ai.request.model",
      "span.status_code",
    ]);
  });

  it("drops malformed conditions from both partitions", () => {
    const { direct, scope } = partitionConditions([
      { attribute: "bad attr!", values: ["x"] },
      { attribute: "gen_ai.request.model", values: [] },
      { attribute: "gen_ai.agent.name", values: ["ok"] },
    ]);
    expect(scope).toHaveLength(1);
    expect(scope[0].attribute).toBe("gen_ai.agent.name");
    expect(direct).toHaveLength(0);
  });

  it("returns empty partitions for an empty / undefined input", () => {
    expect(partitionConditions([])).toEqual({ direct: [], scope: [] });
    expect(partitionConditions(undefined)).toEqual({ direct: [], scope: [] });
  });
});

describe("buildTraceScopeQuery", () => {
  const tf = { from: "now()-24h" };

  it("emits a countIf + having per scope condition and AND-joins across conditions", () => {
    const f: GlobalFilters = {
      conditions: [
        { attribute: "gen_ai.agent.name", values: ["a1", "a2"] },
        { attribute: "gen_ai.tool.name", values: ["t1"] },
      ],
    };
    const q = buildTraceScopeQuery(tf, f, SAFE_TRACE_CAP);
    // Counter per condition, values OR within a condition.
    expect(q).toContain(
      'c0 = countIf(in(toString(gen_ai.agent.name), array("a1", "a2")))',
    );
    expect(q).toContain(
      'c1 = countIf(in(toString(gen_ai.tool.name), array("t1")))',
    );
    // having ANDs the conditions across the trace.
    expect(q).toContain("c0 > 0 and c1 > 0");
    expect(q).toContain("by: { trace.id }");
    expect(q).toContain("trace_id = toString(trace.id)");
  });

  it("runs at full fidelity and caps the result at cap+1 (truncation probe)", () => {
    const f: GlobalFilters = {
      conditions: [{ attribute: "gen_ai.agent.name", values: ["a"] }],
    };
    const q = buildTraceScopeQuery(tf, f, SAFE_TRACE_CAP);
    expect(q).toContain("samplingRatio: 1");
    expect(q).toContain(`| limit ${SAFE_TRACE_CAP + 1}`);
  });
});

describe("injectTraceScope", () => {
  const SPANS = "fetch spans, samplingRatio: 1, from: now()-24h\n| summarize count()";

  it("injects in(trace.id, array(toUid(...))) after the fetch", () => {
    const out = injectTraceScope(SPANS, ["abc", "def"]);
    expect(out).toContain(
      '| filter in(trace.id, array(toUid("abc"), toUid("def")))',
    );
    expect(out.indexOf("in(trace.id")).toBeLessThan(out.indexOf("summarize"));
  });

  it("scopes a nested span fetch in a join too", () => {
    const multi =
      "fetch spans, from: now()-1h\n| join [\n    fetch spans, from: now()-1h\n    | fields trace.id\n  ], on: { trace.id }";
    const out = injectTraceScope(multi, ["x"]);
    expect(out.match(/\| filter in\(trace\.id, array\(toUid\("x"\)\)\)/g)).toHaveLength(2);
  });

  it("injects a no-match sentinel when the scope resolved to zero traces", () => {
    const out = injectTraceScope(SPANS, []);
    expect(out).toContain("in(trace.id, array(toUid(");
    // A real trace never matches the all-zero id, so the page renders empty.
    expect(out).toContain("00000000000000000000000000000000");
  });

  it("no-ops when traceIds is null (no scope conditions active)", () => {
    expect(injectTraceScope(SPANS, null)).toBe(SPANS);
  });
});

describe("mcpNotLifecycleClause", () => {
  const clause = mcpNotLifecycleClause();

  it("is null-tolerant: leads with isNull(mcp.method.name) or so non-MCP spans pass", () => {
    expect(clause).toContain("isNull(mcp.method.name) or");
  });

  it("excludes all four MCP lifecycle methods", () => {
    for (const m of MCP_LIFECYCLE_METHODS) {
      expect(clause).toContain(`mcp.method.name != "${m}"`);
    }
  });

  it("wraps the predicate in parentheses (safe to AND into a larger condition)", () => {
    expect(clause.startsWith("(")).toBe(true);
    expect(clause.endsWith(")")).toBe(true);
  });

  it("emits the exact expected DQL", () => {
    expect(clause).toBe(
      '(isNull(mcp.method.name) or (mcp.method.name != "tools/list" and mcp.method.name != "initialize" and mcp.method.name != "notifications/initialized" and mcp.method.name != "ping"))',
    );
  });
});

describe("exists (presence) conditions", () => {
  const TTFT = [
    "gen_ai.response.ttft",
    "gen_ai.usage.time_to_first_token",
    "gen_ai.response.time_to_first_chunk",
  ];

  it("routes exists conditions to the trace-scope subset", () => {
    const { direct, scope } = partitionConditions([
      { attribute: "gen_ai.response.ttft", values: TTFT, op: "exists" },
      { attribute: "gen_ai.request.model", values: ["m"] },
    ]);
    expect(scope.map((c) => c.attribute)).toEqual(["gen_ai.response.ttft"]);
    expect(direct.map((c) => c.attribute)).toEqual(["gen_ai.request.model"]);
  });

  it("resolver tests presence of any listed attribute (OR-joined isNotNull)", () => {
    const q = buildTraceScopeQuery(
      { from: "now()-24h" },
      { conditions: [{ attribute: "gen_ai.response.ttft", values: TTFT, op: "exists" }] },
      SAFE_TRACE_CAP,
    );
    expect(q).toContain(
      "c0 = countIf((isNotNull(gen_ai.response.ttft) or isNotNull(gen_ai.usage.time_to_first_token) or isNotNull(gen_ai.response.time_to_first_chunk)))",
    );
    expect(q).toContain("c0 > 0");
  });

  it("direct injection emits an isNotNull-OR filter for an exists condition", () => {
    const out = injectGlobalFilters(
      "fetch spans, from: now()-1h\n| summarize count()",
      { conditions: [{ attribute: "gen_ai.response.ttft", values: TTFT, op: "exists" }] },
    );
    expect(out).toContain(
      "| filter (isNotNull(gen_ai.response.ttft) or isNotNull(gen_ai.usage.time_to_first_token) or isNotNull(gen_ai.response.time_to_first_chunk))",
    );
  });

  it("drops exists conditions whose attribute names are unsafe", () => {
    const out = validConditions({
      conditions: [
        { attribute: "gen_ai.response.ttft", values: ["ok.attr", "bad attr!"], op: "exists" },
      ],
    });
    expect(out).toHaveLength(0);
  });

  it("keeps exists conditions with only safe attribute names", () => {
    const out = validConditions({
      conditions: [
        { attribute: "gen_ai.response.ttft", values: ["gen_ai.response.ttft"], op: "exists" },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].op).toBe("exists");
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
