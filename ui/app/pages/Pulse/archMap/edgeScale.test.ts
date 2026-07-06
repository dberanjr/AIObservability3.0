import { describe, expect, it } from "vitest";
import { EDGE_FLOOR, perceptualEdgeWeight } from "./edgeScale";

describe("perceptualEdgeWeight", () => {
  it("returns the floor for zero / invalid counts", () => {
    expect(perceptualEdgeWeight(0, 100)).toBe(EDGE_FLOOR);
    expect(perceptualEdgeWeight(50, 0)).toBe(EDGE_FLOOR);
    expect(perceptualEdgeWeight(-5, 100)).toBe(EDGE_FLOOR);
  });

  it("returns 1 for the busiest edge", () => {
    expect(perceptualEdgeWeight(100, 100)).toBe(1);
  });

  it("clamps counts above the max to 1", () => {
    expect(perceptualEdgeWeight(200, 100)).toBe(1);
  });

  it("lifts a mid-volume edge above its linear ratio so it stays distinguishable", () => {
    // ratio 0.04 -> sqrt 0.2, well above the linear 0.04 and above the floor.
    expect(perceptualEdgeWeight(4, 100)).toBeCloseTo(0.2, 5);
    expect(perceptualEdgeWeight(4, 100)).toBeGreaterThan(4 / 100);
  });

  it("still floors an edge so small its √-ratio drops below the floor", () => {
    // ratio 0.01 -> sqrt 0.1 < 0.12 floor.
    expect(perceptualEdgeWeight(1, 100)).toBe(EDGE_FLOOR);
  });
});
