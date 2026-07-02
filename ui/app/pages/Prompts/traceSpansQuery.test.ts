import { describe, expect, it } from "vitest";
import { buildTraceSpansQuery, TRACE_SPANS_LIMIT } from "./queries";

describe("buildTraceSpansQuery — full trace fetch", () => {
  const q = buildTraceSpansQuery("7047d8bbdc8e032c358c75c5c1f4a473", 1781800000000);

  it("does NOT filter to AI-only spans (fetches the whole trace)", () => {
    expect(q).not.toContain("| filter isNotNull(gen_ai.agent.name)");
  });

  it("uses the raised full-trace ceiling of 1500", () => {
    expect(TRACE_SPANS_LIMIT).toBe(1500);
    expect(q).toContain("| limit 1500");
    expect(q).not.toContain("| limit 100");
    expect(q).not.toContain("| limit 500");
  });

  it("still scopes by trace.id via toUid", () => {
    expect(q).toContain('toUid("7047d8bbdc8e032c358c75c5c1f4a473")');
  });

  it("dedups by span id and sorts by start_time", () => {
    expect(q).toContain("| dedup {span.id}");
    expect(q).toContain("| sort start_time asc");
  });

  it("returns the FULL attribute set (no curated | fields projection)", () => {
    // The panel groups every raw attribute by namespace, so the query must not
    // project a fixed field list.
    expect(q).not.toMatch(/\|\s*fields\b/);
    // …but it still strips the large, unshown span.events column.
    expect(q).toContain("| fieldsRemove span.events");
  });

  it("adds the derived helper columns used by the waterfall", () => {
    expect(q).toContain("dur_ms = duration / 1000000");
    expect(q).toContain(
      'has_error = if(isNotNull(exception.type) or span.status_code == "error", true, else: false)',
    );
    expect(q).toContain("in_tok = toLong(coalesce(gen_ai.usage.input_tokens");
    expect(q).toContain("svc = coalesce(service.name, getNodeName(dt.smartscape.service))");
  });
});
