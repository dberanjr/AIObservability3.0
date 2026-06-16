import { describe, expect, it } from "vitest";
import { buildPromptsListQuery } from "./queries";
import type { Timeframe } from "../../scope/types";

const TF: Timeframe = { from: "now()-24h" };

describe("buildPromptsListQuery — agent filter", () => {
  it("joins to the agent's traces server-side when agents are selected", () => {
    const q = buildPromptsListQuery(null, TF, undefined, {
      agents: ["bos-rfnds-agnt-test"],
    });
    // Inner-join on trace.id to the spans carrying the selected agent name.
    expect(q).toContain("| join [");
    expect(q).toContain(
      'filter in(gen_ai.agent.name, array("bos-rfnds-agnt-test"))',
    );
    expect(q).toContain("kind: inner");
    expect(q).toContain("on: { trace.id }");
    // The join must come before the 200-row cap so it isn't sample-limited.
    expect(q.indexOf("| join [")).toBeLessThan(q.indexOf("| limit 200"));
  });

  it("adds no join when no agent is selected", () => {
    const q = buildPromptsListQuery(null, TF, undefined, {});
    expect(q).not.toContain("| join [");
  });
});

describe("buildPromptsListQuery — content filter relaxation", () => {
  const CONTENT = 'filter prompt_text != "" or response_text != ""';

  it("requires content in the default view", () => {
    const q = buildPromptsListQuery(null, TF, undefined, {});
    expect(q).toContain(CONTENT);
  });

  it("drops the content requirement when the Truncated tile is active", () => {
    const q = buildPromptsListQuery(null, TF, undefined, { onlyTruncated: true });
    // The truncated filter is present...
    expect(q).toContain('contains(toString(gen_ai.response.finish_reasons), "max_tokens")');
    // ...but the content requirement is gone (these proxy spans have no content).
    expect(q).not.toContain(CONTENT);
  });

  it("drops the content requirement for PII / warning tiles too", () => {
    expect(buildPromptsListQuery(null, TF, undefined, { onlyPii: true })).not.toContain(
      CONTENT,
    );
    expect(
      buildPromptsListQuery(null, TF, undefined, { onlyWarnings: true }),
    ).not.toContain(CONTENT);
  });
});
