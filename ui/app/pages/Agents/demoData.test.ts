import { describe, expect, it } from "vitest";
import {
  DEMO_AGENTS,
  DEMO_AGENTS_SUBSTANTIVE,
  DEMO_AGENTS_ORCHESTRATION,
  DEMO_TOTAL_INVOCATIONS,
  DEMO_ORCH_NODES,
  DEMO_AGENT_EVAL,
  DEMO_LOOP_SERIES,
  DEMO_LATENCY_TIERS,
  DEMO_UPSTREAM_ROWS,
  DEMO_DEGRADED_TREND_RECORDS,
  DEMO_DEGRADED_BASELINE_RECORDS,
  DEMO_TOOL_ROWS_BY_AGENT,
  buildDemoInvocationsRecord,
  buildDemoForecast,
} from "./demoData";
import { SLOW_P90_MS } from "./constants";

describe("Agents demo dataset", () => {
  it("has a non-empty substantive fleet plus at least one demoted orchestration node", () => {
    expect(DEMO_AGENTS_SUBSTANTIVE.length).toBeGreaterThan(0);
    expect(DEMO_AGENTS_ORCHESTRATION.length).toBeGreaterThan(0);
    expect(DEMO_AGENTS.length).toBe(
      DEMO_AGENTS_SUBSTANTIVE.length + DEMO_AGENTS_ORCHESTRATION.length,
    );
    // The classifier (name-list + heuristic) must actually demote the
    // LangGraph router node, not just leave it in the substantive list.
    expect(DEMO_AGENTS_ORCHESTRATION.some((a) => a.agent === "should_continue")).toBe(true);
  });

  it("total invocations is positive and matches the sum of substantive rows", () => {
    expect(DEMO_TOTAL_INVOCATIONS).toBeGreaterThan(0);
    const summed = DEMO_AGENTS_SUBSTANTIVE.reduce((s, a) => s + a.invocations, 0);
    expect(DEMO_TOTAL_INVOCATIONS).toBe(summed);
  });

  it("cost is only attributed for agents with a trace-join, and unattributed rows are exactly $0", () => {
    const attributed = DEMO_AGENTS_SUBSTANTIVE.filter((a) => a.costAttributed);
    const unattributed = DEMO_AGENTS_SUBSTANTIVE.filter((a) => !a.costAttributed);
    expect(attributed.length).toBeGreaterThan(0);
    expect(unattributed.length).toBeGreaterThan(0);
    for (const a of attributed) {
      expect(a.cost).toBeGreaterThan(0);
      expect(a.costPerInvocation).toBeGreaterThan(0);
    }
    for (const a of unattributed) {
      expect(a.cost).toBe(0);
      expect(a.costPerInvocation).toBe(0);
    }
  });

  it("has at least 3 slow (P90 > threshold) agents, feeding both the Slow tile and the Degraded-trend panel", () => {
    const slow = DEMO_AGENTS_SUBSTANTIVE.filter((a) => a.p90Ms > SLOW_P90_MS);
    expect(slow.length).toBeGreaterThanOrEqual(3);
    const slowNames = new Set(slow.map((a) => a.agent));
    for (const r of DEMO_DEGRADED_TREND_RECORDS) {
      expect(r.agent && slowNames.has(r.agent)).toBe(true);
    }
    for (const r of DEMO_DEGRADED_BASELINE_RECORDS) {
      expect(r.agent && slowNames.has(r.agent)).toBe(true);
    }
  });

  it("includes a genuine runaway agent (P90 above the 10-minute runaway threshold)", () => {
    const runaway = DEMO_AGENTS_SUBSTANTIVE.find((a) => a.p90Ms >= 600_000);
    expect(runaway).toBeDefined();
    expect(runaway?.errorRatePct).toBeGreaterThan(5);
  });

  it("degraded-trend fixtures reconcile: baseline < current P90 for every flagged agent", () => {
    const byAgent = new Map(DEMO_AGENTS_SUBSTANTIVE.map((a) => [a.agent, a]));
    for (const b of DEMO_DEGRADED_BASELINE_RECORDS) {
      const row = b.agent ? byAgent.get(b.agent) : undefined;
      expect(row).toBeDefined();
      expect(typeof b.baseline_ns).toBe("number");
      if (row && typeof b.baseline_ns === "number") {
        const baselineMs = b.baseline_ns / 1_000_000;
        expect(baselineMs).toBeLessThan(row.p90Ms);
      }
    }
    // Trend arrays are non-empty and every bucket is a finite, non-negative ns value.
    for (const t of DEMO_DEGRADED_TREND_RECORDS) {
      expect((t.p90_ns ?? []).length).toBeGreaterThan(0);
      for (const v of t.p90_ns ?? []) {
        expect(typeof v).toBe("number");
        expect(v as number).toBeGreaterThan(0);
      }
    }
  });

  it("orchestration & runtime nodes reference real demo agents", () => {
    expect(DEMO_ORCH_NODES.length).toBeGreaterThan(0);
    const agentNames = new Set(DEMO_AGENTS.map((a) => a.agent));
    for (const n of DEMO_ORCH_NODES) {
      expect(agentNames.has(n.agent)).toBe(true);
      expect(n.invocations).toBeGreaterThan(0);
    }
  });

  it("evaluation snapshot reports coverage and is non-degenerate", () => {
    expect(DEMO_AGENT_EVAL.hasAnyEval).toBe(true);
    expect(DEMO_AGENT_EVAL.coverage.total).toBeGreaterThan(0);
    expect(DEMO_AGENT_EVAL.toolCorrectnessPct).not.toBeNull();
  });

  it("loop node-execution series is non-empty and sums to its own total", () => {
    expect(DEMO_LOOP_SERIES.values.length).toBeGreaterThan(0);
    const summed = DEMO_LOOP_SERIES.values.reduce((s, v) => s + v, 0);
    expect(DEMO_LOOP_SERIES.total).toBe(summed);
    expect(DEMO_LOOP_SERIES.total).toBeGreaterThan(0);
  });

  it("latency-by-tier totals are positive and LLM dominates (proxy inference time)", () => {
    expect(DEMO_LATENCY_TIERS.tiers.length).toBe(4);
    expect(DEMO_LATENCY_TIERS.totalMs).toBeGreaterThan(0);
    expect(DEMO_LATENCY_TIERS.dominant?.tier).toBe("LLM");
    const summedShare = DEMO_LATENCY_TIERS.tiers.reduce((s, t) => s + t.sharePct, 0);
    expect(summedShare).toBeCloseTo(100, 0);
  });

  it("upstream services rows are non-empty", () => {
    expect(DEMO_UPSTREAM_ROWS.length).toBeGreaterThan(0);
    for (const r of DEMO_UPSTREAM_ROWS) expect(r.services).toBeGreaterThan(0);
  });

  it("invocations chart record sums to the total regardless of bucket interval", () => {
    for (const intervalSec of [60, 300, 3600]) {
      const rec = buildDemoInvocationsRecord(intervalSec);
      const summed = rec.invocations.reduce((s, v) => s + v, 0);
      expect(summed).toBe(DEMO_TOTAL_INVOCATIONS);
      expect(rec.interval).toBe(intervalSec * 1_000_000_000);
    }
  });

  it("synthetic forecast is null for too-short history and a positive band otherwise", () => {
    expect(buildDemoForecast([1, 2], 300)).toBeNull();
    const rec = buildDemoInvocationsRecord(300);
    const forecast = buildDemoForecast(rec.invocations, 300);
    expect(forecast).not.toBeNull();
    if (forecast) {
      expect(forecast.values.length).toBeGreaterThan(0);
      expect(forecast.values.length).toBe(forecast.lower.length);
      expect(forecast.values.length).toBe(forecast.upper.length);
      forecast.values.forEach((v, i) => {
        expect(forecast.lower[i]).toBeLessThanOrEqual(v);
        expect(forecast.upper[i]).toBeGreaterThanOrEqual(v);
      });
    }
  });

  it("every per-agent tool table key is a real demo agent, and each table's call counts sum to that agent's tool_spans (toolCount)", () => {
    const byAgent = new Map(DEMO_AGENTS_SUBSTANTIVE.map((a) => [a.agent, a]));
    for (const [agentName, rows] of Object.entries(DEMO_TOOL_ROWS_BY_AGENT)) {
      const row = byAgent.get(agentName);
      expect(row).toBeDefined();
      expect(rows.length).toBeGreaterThan(0);
      const summedCalls = rows.reduce((s, r) => s + r.calls, 0);
      expect(summedCalls).toBe(row?.toolCount);
    }
  });
});
