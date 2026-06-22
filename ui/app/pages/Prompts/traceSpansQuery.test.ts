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

  it("dedups by span id and sorts by timestamp", () => {
    expect(q).toContain("| dedup {span.id}");
    expect(q).toContain("| sort timestamp asc");
  });

  it("projects the error + langgraph + http attributes", () => {
    expect(q).toContain("status_message = span.status_message");
    expect(q).toContain("http_status = http.response.status_code");
    expect(q).toContain(
      "lg_node = traceloop.association.properties.langgraph_node",
    );
    expect(q).toContain(
      "lg_checkpoint = traceloop.association.properties.langgraph_checkpoint_ns",
    );
  });

  it("keeps the has_error expression catching lowercase status_code error", () => {
    expect(q).toContain(
      'has_error = if(isNotNull(exception.type) or span.status_code == "error", true, else: false)',
    );
  });
});
