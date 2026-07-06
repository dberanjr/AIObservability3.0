import { describe, expect, it } from "vitest";
import {
  buildPromptsListQuery,
  buildPromptsSummaryQuery,
  buildPromptQualityQuery,
} from "./queries";
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

describe("summary + quality aggregates honor the sidebar/focus scope (Prompts-2)", () => {
  it("summary applies status toggles and same-span focus predicates", () => {
    const q = buildPromptsSummaryQuery(
      null,
      TF,
      undefined,
      { onlyErrors: true },
      "llm-rate-limit",
    );
    expect(q).toContain(
      'filter isNotNull(exception.type) or span.status_code == "error"',
    );
    // Same-span focus predicate (rate-limit → http 429) is injected.
    expect(q).toContain("== 429");
    expect(q).toContain("/* focus: llm-rate-limit */");
  });

  it("quality applies provider facet + latency range", () => {
    const q = buildPromptQualityQuery(null, TF, undefined, {
      providers: ["openai"],
      latency: { op: "gt", min: 3000 },
    });
    expect(q).toContain("gen_ai.system, gen_ai.provider.name");
    expect(q).toContain("duration > 3000ms");
  });

  it("does not inject the free-text search or agent join into aggregates", () => {
    const q = buildPromptsSummaryQuery(null, TF, undefined, {
      search: "refund",
      agents: ["agent-x"],
    });
    // search matches the list query's computed prompt_text — absent here.
    expect(q).not.toContain("prompt_text");
    // agent JOIN would change count semantics — excluded from aggregates.
    expect(q).not.toContain("| join [");
  });

  it("is unchanged when no sidebar/focus is passed", () => {
    const plain = buildPromptsSummaryQuery(null, TF);
    expect(plain).not.toContain("/* focus:");
    expect(plain).not.toContain("onlyErrors");
  });
});
