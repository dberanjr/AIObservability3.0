import { describe, expect, it } from "vitest";
import { buildTraceSpansQuery, TRACE_SPANS_LIMIT } from "./queries";

describe("buildTraceSpansQuery — AI filter + raised ceiling", () => {
  const q = buildTraceSpansQuery("7047d8bbdc8e032c358c75c5c1f4a473", 1781800000000);

  it("filters to AI-relevant spans so 1M-span traces don't drown the AI spans", () => {
    expect(q).toContain("isNotNull(gen_ai.agent.name)");
    expect(q).toContain("isNotNull(gen_ai.provider.name)");
    expect(q).toContain("isNotNull(traceloop.span.kind)");
    expect(q).toContain("isNotNull(mcp.method.name)");
  });

  it("raises the limit from 100 to the configured ceiling", () => {
    expect(TRACE_SPANS_LIMIT).toBeGreaterThanOrEqual(500);
    expect(q).toContain(`| limit ${TRACE_SPANS_LIMIT}`);
    expect(q).not.toContain("| limit 100");
  });

  it("still scopes by trace.id via toUid", () => {
    expect(q).toContain('toUid("7047d8bbdc8e032c358c75c5c1f4a473")');
  });
});
