import { describe, expect, it } from "vitest";
import { toGhostBars } from "./geometry";

describe("toGhostBars", () => {
  it("scales the tallest counterfactual (actual+ghost) to maxPx and stacks segments", () => {
    const bars = toGhostBars(
      [{ day: "Jul 5", byModel: { a: 80, b: 60 }, actual: 140, savedByCache: 60 }],
      200,
    );
    const total = bars[0].segments.reduce((s, x) => s + x.px, 0) + bars[0].ghostPx;
    expect(total).toBeCloseTo(200); // (140 actual + 60 ghost) is the max → full height
    expect(bars[0].ghostPx).toBeCloseTo((60 / 200) * 200);
  });

  it("preserves per-model segment order and proportions within a day", () => {
    const bars = toGhostBars(
      [{ day: "Jul 5", byModel: { a: 80, b: 60 }, actual: 140, savedByCache: 60 }],
      200,
    );
    expect(bars[0].segments.map((s) => s.key)).toEqual(["a", "b"]);
    // scale = 200 / 200 = 1 → a's 80 stays 80px, b's 60 stays 60px.
    expect(bars[0].segments[0].px).toBeCloseTo(80);
    expect(bars[0].segments[1].px).toBeCloseTo(60);
  });

  it("scales every day against the SAME max (the tallest day), not its own total", () => {
    const bars = toGhostBars(
      [
        { day: "Jul 5", byModel: { a: 80, b: 60 }, actual: 140, savedByCache: 60 }, // max = 200
        { day: "Jul 6", byModel: { a: 40 }, actual: 40, savedByCache: 10 }, // total = 50, half the max
      ],
      200,
    );
    // scale = 200 / 200 = 1
    expect(bars[1].segments[0].px).toBeCloseTo(40);
    expect(bars[1].ghostPx).toBeCloseTo(10);
    const day2Total = bars[1].segments.reduce((s, x) => s + x.px, 0) + bars[1].ghostPx;
    expect(day2Total).toBeCloseTo(50);
  });

  it("returns [] for an empty points array", () => {
    expect(toGhostBars([], 200)).toEqual([]);
  });

  it("guards against a non-positive max: every px is 0, not NaN/Infinity", () => {
    const bars = toGhostBars(
      [{ day: "Jul 5", byModel: { a: 0, b: 0 }, actual: 0, savedByCache: 0 }],
      200,
    );
    expect(bars[0].segments.every((s) => s.px === 0)).toBe(true);
    expect(bars[0].ghostPx).toBe(0);
  });

  it("guards against a negative maxPx budget without producing NaN", () => {
    const bars = toGhostBars(
      [{ day: "Jul 5", byModel: { a: 10 }, actual: 10, savedByCache: 5 }],
      -100,
    );
    expect(bars[0].segments.every((s) => Number.isFinite(s.px))).toBe(true);
    expect(Number.isFinite(bars[0].ghostPx)).toBe(true);
  });

  it("with includeGhost=false, scales against actual only and zeroes every ghostPx", () => {
    const bars = toGhostBars(
      [
        { day: "Jul 5", byModel: { a: 80, b: 60 }, actual: 140, savedByCache: 60 }, // tallest actual = 140
        { day: "Jul 6", byModel: { a: 40 }, actual: 40, savedByCache: 10 },
      ],
      200,
      false,
    );
    // scale = 200 / 140 (actual-only max) — contrast with the includeGhost=true
    // test above, which scales against 200 (140 actual + 60 ghost).
    const day1Total = bars[0].segments.reduce((s, x) => s + x.px, 0);
    expect(day1Total).toBeCloseTo(200); // the tallest ACTUAL fills maxPx
    expect(bars.every((b) => b.ghostPx === 0)).toBe(true);
  });
});
