import { describe, expect, it } from "vitest";
import { detectWithinTraceGrowth } from "./growthDetector";
import { emptyTokens, type NormalizedTokens } from "../../../data/pricing";

const call = (p: Partial<NormalizedTokens>): NormalizedTokens => ({
  ...emptyTokens(),
  ...p,
});

describe("detectWithinTraceGrowth", () => {
  it("fires when billable tokens climb across >=3 calls", () => {
    const r = detectWithinTraceGrowth([
      call({ inputTokens: 100, outputTokens: 20 }),
      call({ inputTokens: 250, outputTokens: 40 }),
      call({ inputTokens: 600, outputTokens: 80 }),
    ]);
    expect(r.fired).toBe(true);
    expect(r.growthRatio).toBeGreaterThan(2.5);
  });

  it("does NOT fire for a cached-prefix loop (high raw input, low billable)", () => {
    // Each iteration re-sends a 1M-token cached prefix (cache READ, deeply
    // discounted, excluded from billable) but only ~120 fresh tokens. Raw input
    // is enormous and growing, billable is flat → must NOT fire.
    const r = detectWithinTraceGrowth([
      call({ inputTokens: 100, outputTokens: 20, cacheReadTokens: 1_000_000 }),
      call({ inputTokens: 100, outputTokens: 20, cacheReadTokens: 2_000_000 }),
      call({ inputTokens: 100, outputTokens: 20, cacheReadTokens: 3_000_000 }),
    ]);
    expect(r.fired).toBe(false);
    // Proof it operated on billable tokens, not raw input.
    expect(r.billableSeq).toEqual([120, 120, 120]);
  });

  it("does not fire with fewer than 3 calls", () => {
    expect(
      detectWithinTraceGrowth([
        call({ inputTokens: 100 }),
        call({ inputTokens: 9999 }),
      ]).fired,
    ).toBe(false);
  });

  it("does not fire on a flat sequence", () => {
    expect(
      detectWithinTraceGrowth([
        call({ inputTokens: 100, outputTokens: 50 }),
        call({ inputTokens: 100, outputTokens: 50 }),
        call({ inputTokens: 100, outputTokens: 50 }),
      ]).fired,
    ).toBe(false);
  });

  it("does not fire when the peak is not at the end (spike then settle)", () => {
    expect(
      detectWithinTraceGrowth([
        call({ inputTokens: 100 }),
        call({ inputTokens: 900 }),
        call({ inputTokens: 120 }),
      ]).fired,
    ).toBe(false);
  });

  it("counts cache WRITES as billable (they are paid, growing tokens)", () => {
    const r = detectWithinTraceGrowth([
      call({ inputTokens: 100, cacheWriteTokens: 0 }),
      call({ inputTokens: 100, cacheWriteTokens: 300 }),
      call({ inputTokens: 100, cacheWriteTokens: 800 }),
    ]);
    expect(r.billableSeq).toEqual([100, 400, 900]);
    expect(r.fired).toBe(true);
  });
});
