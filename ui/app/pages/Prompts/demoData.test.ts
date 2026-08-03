import { describe, expect, it } from "vitest";
import {
  RAW_DEMO_PROMPT_RECORDS,
  DEMO_TRACE_AGENT_MAP,
  RAW_DEMO_TRACE_SPAN_RECORDS_BY_TRACE_ID,
  RAW_DEMO_TRACE_LOG_RECORDS_BY_TRACE_ID,
  RAW_DEMO_SPAN_DETAIL_RECORDS_BY_SPAN_ID,
  DEMO_SPAN_LOG_COUNTS_BY_SPAN_ID,
  DEMO_PROMPT_SUMMARY_RAW,
  DEMO_PROMPT_QUALITY_RAW,
} from "./demoData";
import {
  parsePromptRecords,
  buildPromptSummary,
  buildPromptQuality,
  parseTraceSpanRecords,
  parseTraceLogRecords,
  parseSpanDetailRecord,
} from "./promptsParse";

describe("Prompts demo dataset", () => {
  it("has a non-empty raw prompt record set with every row parseable", () => {
    expect(RAW_DEMO_PROMPT_RECORDS.length).toBeGreaterThan(0);
    const rows = parsePromptRecords(RAW_DEMO_PROMPT_RECORDS, DEMO_TRACE_AGENT_MAP);
    expect(rows.length).toBe(RAW_DEMO_PROMPT_RECORDS.length);
    for (const r of rows) {
      expect(Number.isFinite(r.timestampMs)).toBe(true);
      expect(r.inTokens).toBeGreaterThanOrEqual(0);
      expect(r.outTokens).toBeGreaterThanOrEqual(0);
    }
  });

  it("backfills the agent name onto LLM-kind rows sharing a trace with an Agent-kind row", () => {
    const rows = parsePromptRecords(RAW_DEMO_PROMPT_RECORDS, DEMO_TRACE_AGENT_MAP);
    // The billing trace's follow-up LLM call carries no gen_ai.agent.name of
    // its own — it must resolve to "billing-agent" via the trace→agent map,
    // exactly like a real tenant's LLM-only spans do.
    const billingFollowUp = rows.find((r) => r.spanId === "billing-llm-2");
    expect(billingFollowUp?.kind).toBe("LLM");
    expect(billingFollowUp?.agent).toBe("billing-agent");

    const triageFollowUp = rows.find((r) => r.spanId === "triage-llm-2");
    expect(triageFollowUp?.agent).toBe("triage-agent");

    // At least one row is directly Agent-kind (carries gen_ai.agent.name on
    // the row itself, no backfill needed).
    expect(rows.some((r) => r.kind === "Agent")).toBe(true);
    // At least one row is a genuinely standalone LLM call with no agent at all.
    expect(rows.some((r) => r.kind === "LLM" && r.agent == null)).toBe(true);
  });

  it("carries a realistic mix of models, providers, and services", () => {
    const rows = parsePromptRecords(RAW_DEMO_PROMPT_RECORDS, DEMO_TRACE_AGENT_MAP);
    expect(new Set(rows.map((r) => r.model)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(rows.map((r) => r.provider)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(rows.map((r) => r.service)).size).toBeGreaterThanOrEqual(3);
  });

  it("includes at least one error, one truncated+PII response, and one warning", () => {
    const rows = parsePromptRecords(RAW_DEMO_PROMPT_RECORDS, DEMO_TRACE_AGENT_MAP);
    expect(rows.some((r) => r.hasError)).toBe(true);
    expect(rows.some((r) => r.truncated && r.piiDetected)).toBe(true);
    expect(rows.some((r) => r.hasWarning)).toBe(true);
  });

  it("has genuinely varied eval scores across at least two distinct models (worst-models breakdown needs this)", () => {
    const rows = parsePromptRecords(RAW_DEMO_PROMPT_RECORDS, DEMO_TRACE_AGENT_MAP);
    const belowPassingCorrectness = rows.filter(
      (r) => r.evalCorrectness != null && r.evalCorrectness < 0.6,
    );
    expect(new Set(belowPassingCorrectness.map((r) => r.model)).size).toBeGreaterThanOrEqual(2);
    // Some rows deliberately carry no eval scores at all (partial coverage).
    expect(
      rows.some(
        (r) =>
          r.evalHallucination == null &&
          r.evalCorrectness == null &&
          r.evalFaithfulness == null &&
          r.evalRelevance == null,
      ),
    ).toBe(true);
  });

  it("summary aggregate reconciles exactly with the row-level fixtures it was folded from", () => {
    const rows = parsePromptRecords(RAW_DEMO_PROMPT_RECORDS, DEMO_TRACE_AGENT_MAP);
    const summary = buildPromptSummary(DEMO_PROMPT_SUMMARY_RAW);
    expect(summary.total).toBe(rows.length);
    expect(summary.errors).toBe(rows.filter((r) => r.hasError).length);
    expect(summary.piiDetected).toBe(rows.filter((r) => r.piiDetected).length);
    expect(summary.warnings).toBe(rows.filter((r) => r.hasWarning).length);
    expect(summary.truncated).toBe(rows.filter((r) => r.truncated).length);
    expect(summary.avgDurationMs).toBeGreaterThan(0);
  });

  it("quality aggregate reconciles with the row-level eval scores", () => {
    const rows = parsePromptRecords(RAW_DEMO_PROMPT_RECORDS, DEMO_TRACE_AGENT_MAP);
    const quality = buildPromptQuality(DEMO_PROMPT_QUALITY_RAW);
    expect(quality.hasAnyEval).toBe(true);
    const withHalluc = rows.filter((r) => r.evalHallucination != null);
    expect(quality.hallucination.coverage).toBe(withHalluc.length);
    const expectedPct =
      (withHalluc.reduce((s, r) => s + (r.evalHallucination as number), 0) / withHalluc.length) *
      100;
    expect(quality.hallucination.pct).toBeCloseTo(expectedPct, 5);
    // Hallucination is bad-when-high; the demo keeps it low (a healthy fleet).
    expect(quality.hallucination.pct ?? 100).toBeLessThan(20);
  });

  it("every prompt row's trace has a matching (non-empty) trace-span fixture, including the row's own span", () => {
    for (const r of RAW_DEMO_PROMPT_RECORDS) {
      const traceId = r.trace_id as string;
      const spans = RAW_DEMO_TRACE_SPAN_RECORDS_BY_TRACE_ID[traceId];
      expect(spans, `missing span fixtures for trace ${traceId}`).toBeDefined();
      expect(spans.length).toBeGreaterThan(0);
      expect(spans.some((s) => s["span.id"] === r.span_id)).toBe(true);
    }
  });

  it("parses every demo trace's spans into a well-formed waterfall (exactly one root, valid parent links)", () => {
    for (const [traceId, records] of Object.entries(RAW_DEMO_TRACE_SPAN_RECORDS_BY_TRACE_ID)) {
      const spans = parseTraceSpanRecords(records);
      expect(spans.length, traceId).toBe(records.length);
      const roots = spans.filter((s) => s.parentSpanId == null);
      expect(roots.length, `trace ${traceId} should have exactly one root`).toBe(1);
      const ids = new Set(spans.map((s) => s.spanId));
      for (const s of spans) {
        if (s.parentSpanId != null) {
          expect(ids.has(s.parentSpanId), `${traceId}: dangling parent ${s.parentSpanId}`).toBe(
            true,
          );
        }
      }
    }
  });

  it("the errored trace's root span parses with isError true and an exception message", () => {
    const spans = parseTraceSpanRecords(RAW_DEMO_TRACE_SPAN_RECORDS_BY_TRACE_ID["trace-err-1"]);
    const root = spans.find((s) => s.parentSpanId == null);
    expect(root?.isError).toBe(true);
    expect(root?.exceptionType).toMatch(/RateLimit/i);
  });

  it("trace log fixtures reference span ids that exist in that same trace", () => {
    for (const [traceId, records] of Object.entries(RAW_DEMO_TRACE_LOG_RECORDS_BY_TRACE_ID)) {
      const logs = parseTraceLogRecords(records);
      expect(logs.length).toBeGreaterThan(0);
      const spanIds = new Set(
        (RAW_DEMO_TRACE_SPAN_RECORDS_BY_TRACE_ID[traceId] ?? []).map((s) => s["span.id"]),
      );
      for (const log of logs) {
        if (log.spanId) expect(spanIds.has(log.spanId)).toBe(true);
      }
    }
  });

  it("every prompt row has a span-detail fixture that parses to a non-null detail", () => {
    for (const r of RAW_DEMO_PROMPT_RECORDS) {
      const spanId = r.span_id as string;
      const raw = RAW_DEMO_SPAN_DETAIL_RECORDS_BY_SPAN_ID[spanId];
      expect(raw, `missing span-detail fixture for ${spanId}`).toBeDefined();
      const detail = parseSpanDetailRecord(raw);
      expect(detail).not.toBeNull();
      expect(detail?.requestModel).toBe(r.model);
    }
  });

  it("span log counts reconcile with the flagged spans (error/warning trace logs)", () => {
    expect(DEMO_SPAN_LOG_COUNTS_BY_SPAN_ID["err-root-1"].error).toBeGreaterThan(0);
    expect(DEMO_SPAN_LOG_COUNTS_BY_SPAN_ID["triage-root-1"].warning).toBeGreaterThan(0);
  });
});
