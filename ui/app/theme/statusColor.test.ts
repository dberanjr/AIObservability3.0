import { describe, expect, it } from "vitest";
import { deltaStatus, STATUS_COLOR, STATUS_CUE } from "./statusColor";

describe("deltaStatus", () => {
  it("is neutral for null / zero", () => {
    expect(deltaStatus(null)).toBe("neutral");
    expect(deltaStatus(0)).toBe("neutral");
  });
  it("is good for a favorable move (invert-aware)", () => {
    expect(deltaStatus(5)).toBe("good"); // up, not inverted
    expect(deltaStatus(-40, { invert: true })).toBe("good"); // spend down
  });
  it("warns on a mild bad move and escalates a severe one", () => {
    expect(deltaStatus(10, { invert: true, severeAt: 50 })).toBe("warning");
    expect(deltaStatus(400, { invert: true, severeAt: 50 })).toBe("critical");
  });
});

describe("STATUS_COLOR / STATUS_CUE", () => {
  it("covers every status with a color and a non-color cue", () => {
    for (const s of ["good", "info", "warning", "critical", "neutral"] as const) {
      expect(STATUS_COLOR[s]).toMatch(/^var\(--/);
      expect(STATUS_CUE[s].glyph.length).toBeGreaterThan(0);
      expect(STATUS_CUE[s].label.length).toBeGreaterThan(0);
    }
  });
});
