import { describe, expect, it } from "vitest";
import { FOCUS_PREDICATES, isPromptsFocus } from "./focus";
import { buildPromptsListQuery } from "./queries";
import type { Timeframe } from "../../scope/types";

const TF: Timeframe = { from: "now()-24h" };

const LLM_IDS = [
  "llm-ctx-exhaustion",
  "llm-logical-errors",
  "llm-rate-limit",
  "llm-model-mismatch",
  "llm-ttft-degradation",
  "orch-token-growth",
] as const;

describe("FOCUS_PREDICATES", () => {
  it("defines all 6 LLM-tier focus ids with non-empty label + predicate", () => {
    for (const id of LLM_IDS) {
      const preset = FOCUS_PREDICATES[id];
      expect(preset, `missing preset ${id}`).toBeDefined();
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.predicate.trim().length).toBeGreaterThan(0);
    }
  });

  it("recognises known ids and rejects unknown ones", () => {
    expect(isPromptsFocus("llm-rate-limit")).toBe(true);
    expect(isPromptsFocus("llm-nope")).toBe(false);
    expect(isPromptsFocus(null)).toBe(false);
    expect(isPromptsFocus("")).toBe(false);
  });
});

describe("buildPromptsListQuery — focus presets", () => {
  it("omits any focus clause when no focus is given", () => {
    const q = buildPromptsListQuery(null, TF, undefined, undefined, undefined);
    expect(q).not.toContain("/* focus:");
  });

  it("omits the focus clause for an unknown focus id", () => {
    const q = buildPromptsListQuery(null, TF, undefined, undefined, "llm-nope");
    expect(q).not.toContain("/* focus:");
  });

  it("injects the 429 clause for llm-rate-limit", () => {
    const q = buildPromptsListQuery(null, TF, undefined, undefined, "llm-rate-limit");
    expect(q).toContain("/* focus: llm-rate-limit */");
    expect(q).toContain("toLong(coalesce(http.response.status_code, 0)) == 429");
  });

  it("injects the finish_reasons clause for llm-ctx-exhaustion", () => {
    const q = buildPromptsListQuery(null, TF, undefined, undefined, "llm-ctx-exhaustion");
    expect(q).toContain('contains(toString(gen_ai.response.finish_reasons), "max_tokens")');
    expect(q).toContain('contains(toString(gen_ai.response.finish_reasons), "length")');
  });

  it("injects the shared logical-error rule for llm-logical-errors", () => {
    const q = buildPromptsListQuery(null, TF, undefined, undefined, "llm-logical-errors");
    // hallmark of LOGICAL_ERROR_EXPR
    expect(q).toContain('toLong(coalesce(http.response.status_code, 0)) >= 400');
    expect(q).toContain("isNotNull(exception.type)");
  });

  it("injects a request-vs-response model comparison for llm-model-mismatch", () => {
    const q = buildPromptsListQuery(null, TF, undefined, undefined, "llm-model-mismatch");
    expect(q).toContain("isNotNull(gen_ai.response.model)");
    expect(q).toContain("gen_ai.request.model");
    expect(q).toContain("gen_ai.response.model");
  });

  it("injects an isNotNull(ttft) gate and a ttft sort for llm-ttft-degradation", () => {
    const q = buildPromptsListQuery(null, TF, undefined, undefined, "llm-ttft-degradation");
    expect(q).toContain("isNotNull(gen_ai.response.ttft)");
    expect(q).toContain("gen_ai.response.ttft");
    // orderBy is applied as a sort that wins over the default timestamp sort
    expect(q).toContain("| sort gen_ai.response.ttft desc");
  });

  it("orders by total token usage for orch-token-growth", () => {
    const q = buildPromptsListQuery(null, TF, undefined, undefined, "orch-token-growth");
    expect(q).toContain("| sort in_tok + out_tok desc");
  });

  it("keeps the sidebar filter alongside the focus (ANDs)", () => {
    const q = buildPromptsListQuery(null, TF, undefined, { onlyErrors: true }, "llm-rate-limit");
    expect(q).toContain('isNotNull(exception.type) or span.status_code == "error"');
    expect(q).toContain("toLong(coalesce(http.response.status_code, 0)) == 429");
  });

  it("emits the focus predicate for every known id", () => {
    for (const id of LLM_IDS) {
      const q = buildPromptsListQuery(null, TF, undefined, undefined, id);
      expect(q, `focus marker missing for ${id}`).toContain(`/* focus: ${id} */`);
    }
  });
});
