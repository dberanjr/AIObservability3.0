import { describe, expect, it } from "vitest";
import { summarizeAgentTtft } from "./ttft";

// The helper only reads `agent` + `ttftMs`, so tests use minimal row stubs.
const rows = (...pairs: [string, number | null][]) =>
  pairs.map(([agent, ttftMs]) => ({ agent, ttftMs }));

describe("summarizeAgentTtft", () => {
  it("returns null when no agents emit TTFT", () => {
    expect(summarizeAgentTtft([])).toBeNull();
    expect(summarizeAgentTtft(rows(["a", null], ["b", null]))).toBeNull();
  });

  it("ignores null, non-finite, and non-positive values", () => {
    const s = summarizeAgentTtft(
      rows(["a", null], ["b", NaN as unknown as number], ["c", 0], ["d", -5], ["e", 400]),
    );
    expect(s).not.toBeNull();
    expect(s!.agentsWithTtft).toBe(1);
    expect(s!.medianMs).toBe(400);
    expect(s!.values).toEqual([400]);
    expect(s!.agentNames).toEqual(["e"]);
  });

  it("computes median (P50), P90 and mean across per-agent values", () => {
    // Deliberately unsorted input; nearest-rank percentiles on 5 values.
    const s = summarizeAgentTtft(
      rows(["a", 700], ["b", 400], ["c", 800], ["d", 600], ["e", 500]),
    );
    expect(s!.agentsWithTtft).toBe(5);
    expect(s!.medianMs).toBe(600); // ceil(0.5*5)=3 -> 3rd smallest
    expect(s!.p90Ms).toBe(800); // ceil(0.9*5)=5 -> largest
    expect(s!.avgMs).toBe(600);
    expect(s!.values).toEqual([400, 500, 600, 700, 800]); // ascending, for charting
    // agentNames align with values (ascending by TTFT).
    expect(s!.agentNames).toEqual(["b", "e", "d", "a", "c"]);
  });

  it("handles a single emitting agent", () => {
    const s = summarizeAgentTtft(rows(["solo", 9700]));
    expect(s!.agentsWithTtft).toBe(1);
    expect(s!.medianMs).toBe(9700);
    expect(s!.p90Ms).toBe(9700);
    expect(s!.avgMs).toBe(9700);
    expect(s!.agentNames).toEqual(["solo"]);
  });
});
