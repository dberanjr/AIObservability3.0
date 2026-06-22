import { describe, expect, it } from "vitest";
import {
  hasActiveFilter,
  injectGlobalFilters,
  mcpNotLifecycleClause,
  MCP_LIFECYCLE_METHODS,
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
