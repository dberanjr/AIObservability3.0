import { describe, expect, it } from "vitest";
import {
  pickRepresentativeTraces,
  type CandidateTrace,
} from "./representativeTraces";

/** Build a candidate with sensible defaults so tests stay terse. */
const c = (
  traceId: string,
  durMs: number,
  startMs: number,
  isError = false,
  calls = 1,
): CandidateTrace => ({ traceId, durMs, startMs, isError, calls });

describe("pickRepresentativeTraces", () => {
  it("returns [] for an empty candidate pool", () => {
    expect(pickRepresentativeTraces([])).toEqual([]);
  });

  it("returns all candidates (labeled) when fewer than max", () => {
    const pool = [c("a", 10, 100), c("b", 20, 200), c("c", 30, 300)];
    const out = pickRepresentativeTraces(pool, 10);
    expect(out).toHaveLength(3);
    expect(new Set(out.map((r) => r.traceId))).toEqual(
      new Set(["a", "b", "c"]),
    );
    // Every selection carries a non-empty human label.
    for (const r of out) expect(r.label.length).toBeGreaterThan(0);
  });

  it("selects the slowest and fastest by durMs", () => {
    const pool = [
      c("slow", 1000, 100),
      c("mid", 500, 200),
      c("fast", 10, 300),
    ];
    const out = pickRepresentativeTraces(pool, 10);
    const byId = new Map(out.map((r) => [r.traceId, r]));
    expect(byId.get("slow")?.label).toBe("slowest");
    expect(byId.get("fast")?.label).toBe("fastest");
  });

  it("includes the median-latency trace", () => {
    const pool = [
      c("a", 100, 100),
      c("b", 200, 200),
      c("c", 300, 300),
      c("d", 400, 400),
      c("e", 500, 500),
    ];
    const out = pickRepresentativeTraces(pool, 10);
    const labels = new Map(out.map((r) => [r.traceId, r.label]));
    // median of 5 sorted by dur -> the middle one ("c" @ 300ms)
    expect(labels.get("c")).toBe("median");
  });

  it("includes up to 2 errored traces when present", () => {
    const pool = [
      c("ok1", 100, 100, false),
      c("err1", 110, 110, true),
      c("err2", 120, 120, true),
      c("err3", 130, 130, true),
      c("ok2", 900, 900, false),
    ];
    const out = pickRepresentativeTraces(pool, 10);
    const errored = out.filter((r) => r.isError);
    // at least 2 errored traces surfaced, all labeled "errored"
    expect(errored.length).toBeGreaterThanOrEqual(2);
    for (const r of errored) {
      if (r.label === "errored") expect(r.isError).toBe(true);
    }
  });

  it("includes the most-recent and oldest by startMs", () => {
    const pool = [
      c("oldest", 300, 1000),
      c("mid", 300, 5000),
      c("recent", 300, 9000),
    ];
    const out = pickRepresentativeTraces(pool, 10);
    const labels = new Map(out.map((r) => [r.traceId, r.label]));
    expect(labels.has("recent")).toBe(true);
    expect(labels.has("oldest")).toBe(true);
  });

  it("dedups by traceId (one trace that is both slowest and most-recent)", () => {
    const pool = [
      c("x", 1000, 9000), // slowest AND most recent
      c("y", 10, 1000), // fastest AND oldest
      c("z", 500, 5000),
    ];
    const out = pickRepresentativeTraces(pool, 10);
    const ids = out.map((r) => r.traceId);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids
  });

  it("caps the result at max (default 10) with a large diverse pool", () => {
    const pool: CandidateTrace[] = [];
    for (let i = 0; i < 50; i++) {
      pool.push(c(`t${i}`, i * 10 + 5, i * 1000 + 1, i % 7 === 0));
    }
    const out = pickRepresentativeTraces(pool);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(new Set(out.map((r) => r.traceId)).size).toBe(out.length);
  });

  it("respects a custom max", () => {
    const pool: CandidateTrace[] = [];
    for (let i = 0; i < 50; i++) pool.push(c(`t${i}`, i * 10 + 5, i * 1000 + 1));
    const out = pickRepresentativeTraces(pool, 5);
    expect(out.length).toBeLessThanOrEqual(5);
  });

  it("is deterministic — same input yields identical output", () => {
    const pool: CandidateTrace[] = [];
    for (let i = 0; i < 40; i++) {
      pool.push(c(`t${i}`, (i * 37) % 500, i * 1000 + 1, i % 5 === 0));
    }
    const a = pickRepresentativeTraces(pool);
    const b = pickRepresentativeTraces(pool.slice());
    expect(a).toEqual(b);
  });

  it("fills remaining slots by spreading across the latency range", () => {
    // 20 candidates, no errors, distinct durations. Expect a spread, not just
    // the 5 anchor picks.
    const pool: CandidateTrace[] = [];
    for (let i = 0; i < 20; i++) pool.push(c(`t${i}`, i * 50 + 1, i * 1000 + 1));
    const out = pickRepresentativeTraces(pool, 10);
    expect(out.length).toBe(10);
    // The spread fillers should include a "spread" label.
    expect(out.some((r) => r.label === "spread")).toBe(true);
  });

  it("handles a single candidate", () => {
    const out = pickRepresentativeTraces([c("only", 42, 100)]);
    expect(out).toHaveLength(1);
    expect(out[0].traceId).toBe("only");
    expect(out[0].label.length).toBeGreaterThan(0);
  });
});
