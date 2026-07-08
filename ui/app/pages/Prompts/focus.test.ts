import { describe, expect, it } from "vitest";
import {
  FOCUS_PREDICATES,
  CROSS_SPAN_FOCUS,
  isPromptsFocus,
  isCrossSpanFocus,
  crossSpanFocusPreset,
  promptsFocusChip,
  N1_TOOL_CALL_THRESHOLD,
  RETRY_STORM_FAIL_THRESHOLD,
  HISTORY_STATE_THRESHOLD,
} from "./focus";
import { buildPromptsListQuery } from "./queries";
import { SAFE_TRACE_CAP } from "../../scope/queries";
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

describe("tool-token-spike (SAME-SPAN predicate, not trace-scoped)", () => {
  it("is in the same-span FOCUS_PREDICATES, NOT the cross-span catalog", () => {
    expect(FOCUS_PREDICATES["tool-token-spike"]).toBeDefined();
    expect(isPromptsFocus("tool-token-spike")).toBe(true);
    expect(isCrossSpanFocus("tool-token-spike")).toBe(false);
    expect(CROSS_SPAN_FOCUS["tool-token-spike"]).toBeUndefined();
  });

  it("injects a same-span input-token predicate + token sort", () => {
    const q = buildPromptsListQuery(null, TF, undefined, undefined, "tool-token-spike");
    expect(q).toContain("/* focus: tool-token-spike */");
    expect(q).toContain("gen_ai.usage.input_tokens");
    expect(q).toContain("> 8000");
    expect(q).toContain("| sort in_tok desc");
    // It must NOT inject a trace-scope filter — that's the cross-span path.
    expect(q).not.toContain("in(trace.id");
  });
});

describe("CROSS_SPAN_FOCUS — trace-resolution query builders", () => {
  const CROSS_IDS = [
    "tool-retry-storm",
    "agent-n1-tool-calls",
    "vdb-topk-over-retrieval",
    "mem-history-growth",
  ] as const;

  it("defines each cross-span id with a non-empty label", () => {
    for (const id of CROSS_IDS) {
      const preset = CROSS_SPAN_FOCUS[id];
      expect(preset, `missing cross-span preset ${id}`).toBeDefined();
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });

  it("recognises cross-span ids and rejects same-span / unknown ones", () => {
    expect(isCrossSpanFocus("tool-retry-storm")).toBe(true);
    expect(isCrossSpanFocus("agent-n1-tool-calls")).toBe(true);
    expect(isCrossSpanFocus("llm-rate-limit")).toBe(false); // same-span
    expect(isCrossSpanFocus("tool-token-spike")).toBe(false); // same-span
    expect(isCrossSpanFocus("nope")).toBe(false);
    expect(isCrossSpanFocus(null)).toBe(false);
  });

  it("same-span and cross-span catalogs do not overlap", () => {
    for (const id of Object.keys(CROSS_SPAN_FOCUS)) {
      expect(FOCUS_PREDICATES[id], `${id} must not be in both catalogs`).toBeUndefined();
    }
  });

  it("every resolver query summarizes by trace.id, projects trace_id, and caps at cap+1", () => {
    for (const id of CROSS_IDS) {
      const q = crossSpanFocusPreset(id)!.buildResolveQuery(TF, SAFE_TRACE_CAP);
      expect(q, `${id} groups by trace.id`).toContain("by: { trace.id }");
      expect(q, `${id} projects trace_id`).toContain("trace_id = toString(trace.id)");
      expect(q, `${id} caps at cap+1`).toContain(`| limit ${SAFE_TRACE_CAP + 1}`);
      expect(q, `${id} runs at full fidelity`).toContain("samplingRatio: 1");
      // Pre-filter BEFORE the group-by (Lesson 23/38): the first pipe must be a
      // filter, never a bare `summarize by:{trace.id}` over the whole table.
      const firstPipe = q.split("\n").find((l) => l.trim().startsWith("|"));
      expect(firstPipe, `${id} pre-filters before grouping`).toContain("| filter");
    }
  });

  it("tool-retry-storm resolves on a repeated tool-failure signal", () => {
    const q = crossSpanFocusPreset("tool-retry-storm")!.buildResolveQuery(TF, SAFE_TRACE_CAP);
    expect(q).toContain('traceloop.span.kind == "tool"');
    expect(q).toContain('span.status_code == "error"');
    expect(q).toContain(`fails >= ${RETRY_STORM_FAIL_THRESHOLD}`);
  });

  it("agent-n1-tool-calls resolves on a high tool-call count", () => {
    const q = crossSpanFocusPreset("agent-n1-tool-calls")!.buildResolveQuery(TF, SAFE_TRACE_CAP);
    expect(q).toContain('traceloop.span.kind == "tool"');
    expect(q).toContain(`tools >= ${N1_TOOL_CALL_THRESHOLD}`);
  });

  it("vdb-topk-over-retrieval uses the retrieval proxy scoped to agent traces (approximate)", () => {
    const preset = crossSpanFocusPreset("vdb-topk-over-retrieval")!;
    expect(preset.approximate).toBe(true);
    const q = preset.buildResolveQuery(TF, SAFE_TRACE_CAP);
    expect(q).toContain("isNotNull(gen_ai.agent.name)");
    expect(q).toContain('contains(lname,"retriev")');
    // top_k is not emitted on this tenant — the resolver must NOT depend on it.
    expect(q).not.toContain("vector_db.query.top_k");
  });

  it("mem-history-growth resolves on conversation/thread/checkpoint state (approximate)", () => {
    const preset = crossSpanFocusPreset("mem-history-growth")!;
    expect(preset.approximate).toBe(true);
    const q = preset.buildResolveQuery(TF, SAFE_TRACE_CAP);
    expect(q).toContain("gen_ai.conversation.id");
    expect(q).toContain("traceloop.association.properties.thread_id");
    expect(q).toContain("langgraph_checkpoint_ns");
    expect(q).toContain(`state >= ${HISTORY_STATE_THRESHOLD}`);
  });
});

describe("promptsFocusChip — chip label + approximate marker", () => {
  it("returns a non-approximate label for same-span focuses", () => {
    expect(promptsFocusChip("llm-rate-limit")).toEqual({
      label: "Provider rate-limit",
      approximate: false,
    });
    expect(promptsFocusChip("tool-token-spike")?.approximate).toBe(false);
  });

  it("returns an approximate marker for proxy cross-span focuses", () => {
    expect(promptsFocusChip("vdb-topk-over-retrieval")?.approximate).toBe(true);
    expect(promptsFocusChip("mem-history-growth")?.approximate).toBe(true);
  });

  it("returns a non-approximate label for exact cross-span focuses", () => {
    expect(promptsFocusChip("tool-retry-storm")).toEqual({
      label: "Tool retry storm",
      approximate: false,
    });
    expect(promptsFocusChip("agent-n1-tool-calls")?.approximate).toBe(false);
  });

  it("is undefined for unknown / absent focus", () => {
    expect(promptsFocusChip("nope")).toBeUndefined();
    expect(promptsFocusChip(null)).toBeUndefined();
    expect(promptsFocusChip(undefined)).toBeUndefined();
  });
});
