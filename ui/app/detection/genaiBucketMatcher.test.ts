import { describe, expect, it } from "vitest";
import { GENAI_BUCKET_MATCHER, GENAI_BUCKET_ATTRS } from "./genaiBucketMatcher";

const ATTRS = [
  "gen_ai.system",
  "gen_ai.provider.name",
  "gen_ai.operation.name",
  "gen_ai.request.model",
  "gen_ai.agent.name",
  "gen_ai.tool.name",
  "traceloop.span.kind",
  "traceloop.workflow.name",
  "llm.request.type",
  "gen_ai.prompt.0.role",
  "gen_ai.completion.0.role",
  "openinference.span.kind",
];

describe("GENAI_BUCKET_MATCHER", () => {
  it("covers exactly the 12 genai_spans storage-rule attributes", () => {
    expect([...GENAI_BUCKET_ATTRS]).toEqual(ATTRS);
  });
  it("references all 12 attributes, backtick-quoted", () => {
    for (const a of ATTRS) expect(GENAI_BUCKET_MATCHER).toContain("`" + a + "`");
  });
  it("OR-joins them with isNotNull (11 ors for 12 terms)", () => {
    expect(GENAI_BUCKET_MATCHER).toContain("isNotNull");
    expect((GENAI_BUCKET_MATCHER.match(/ or /g) ?? []).length).toBe(11);
  });
});
