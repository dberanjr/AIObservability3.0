import { describe, expect, it } from "vitest";
import {
  buildFleetCountsQuery,
  buildHiddenFailuresQuery,
  buildSameSpanPatternCountsQuery,
  patternAlias,
} from "./queries";
import { FOCUS_PREDICATES } from "../Prompts/focus";

const TF = { from: "now()-24h", to: "now()" };

/**
 * The Summary page adds two small grouped scans on top of the reused hooks:
 *  - the Hidden · 200-OK 3-way split (refusals / max-token truncation /
 *    content-filter), mirroring Explorer's per-span logical-error expressions;
 *  - the same-span problem-pattern match counts, built straight from the real
 *    `FOCUS_PREDICATES` so thresholds never drift from the Prompts detectors.
 * Both are pure string builders — locked here. Scan-limit / sampling / global
 * filter are injected later by useScopedDql, so they must NOT appear yet.
 */

describe("patternAlias", () => {
  it("turns a hyphenated focus id into a safe DQL identifier", () => {
    expect(patternAlias("llm-ctx-exhaustion")).toBe("llm_ctx_exhaustion");
  });

  it("is stable / idempotent for already-safe ids", () => {
    expect(patternAlias("tool_token_spike")).toBe("tool_token_spike");
  });
});

describe("buildHiddenFailuresQuery", () => {
  const q = buildHiddenFailuresQuery(null, TF);

  it("fetches spans at full fidelity with the timeframe (sampling injected later)", () => {
    expect(q).toContain("fetch spans, samplingRatio: 1");
    expect(q).toContain("from: now()-24h");
    expect(q).toContain("to: now()");
  });

  it("does not hardcode scan limit or global filter (useScopedDql injects them)", () => {
    expect(q).not.toContain("scanLimitGBytes");
    expect(q.includes("| filter in(toString(")).toBe(false);
  });

  it("restricts to the LLM span population", () => {
    expect(q).toContain("isNotNull(gen_ai.provider.name)");
  });

  it("counts the three hidden-failure categories with countIf", () => {
    expect(q).toContain("refusals = countIf(");
    expect(q).toContain("truncations = countIf(");
    expect(q).toContain("content_filters = countIf(");
  });

  it("uses finish_reasons — the load-bearing signal on this tenant", () => {
    expect(q).toContain('contains(toString(gen_ai.response.finish_reasons), "max_tokens")');
    expect(q).toContain('contains(toString(gen_ai.response.finish_reasons), "content_filter")');
    expect(q).toContain("refusal");
  });
});

describe("buildFleetCountsQuery", () => {
  const q = buildFleetCountsQuery(null, TF);

  it("counts distinct AI services and agents over the timeframe", () => {
    expect(q).toContain("fetch spans, samplingRatio: 1");
    expect(q).toContain("from: now()-24h");
    expect(q).toContain("services = countDistinct(dt.entity.service)");
    expect(q).toContain("agents = countDistinct(gen_ai.agent.name)");
  });

  it("counts over the provider-OR-agent population so agents aren't zeroed out", () => {
    expect(q).toContain(
      "isNotNull(gen_ai.provider.name) or isNotNull(gen_ai.agent.name)",
    );
  });
});

describe("buildSameSpanPatternCountsQuery", () => {
  const q = buildSameSpanPatternCountsQuery(null, TF);

  it("fetches spans with the timeframe over the LLM population", () => {
    expect(q).toContain("fetch spans, samplingRatio: 1");
    expect(q).toContain("from: now()-24h");
    expect(q).toContain("isNotNull(gen_ai.provider.name)");
  });

  it("emits one countIf per same-span focus predicate, keyed by its safe alias", () => {
    for (const [id, preset] of Object.entries(FOCUS_PREDICATES)) {
      expect(q).toContain(`${patternAlias(id)} = countIf(`);
      // the real predicate string is embedded verbatim (no drift from Prompts)
      expect(q).toContain(preset.predicate);
    }
  });

  it("produces only valid DQL identifier aliases (no hyphens)", () => {
    for (const id of Object.keys(FOCUS_PREDICATES)) {
      expect(patternAlias(id)).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
    }
  });
});
