import { describe, expect, it } from "vitest";
import {
  deltaStatus,
  STATUS_COLOR,
  STATUS_CUE,
  statusFromThreshold,
  toneToColor,
} from "./statusColor";

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
  it("routes severity colors through the --status-* token source", () => {
    expect(STATUS_COLOR.good).toBe("var(--status-ideal)");
    expect(STATUS_COLOR.warning).toBe("var(--status-warning)");
    expect(STATUS_COLOR.critical).toBe("var(--status-critical)");
  });
  it("exposes a `word` alias and an `ideal` cue for the Sev scale", () => {
    for (const s of ["ideal", "warning", "critical"] as const) {
      expect(STATUS_CUE[s].glyph.length).toBeGreaterThan(0);
      expect(STATUS_CUE[s].word.length).toBeGreaterThan(0);
    }
    // label stays an alias of word for existing call sites.
    expect(STATUS_CUE.good.label).toBe(STATUS_CUE.good.word);
  });
});

describe("toneToColor", () => {
  it("maps each tone to the shared status/text token", () => {
    expect(toneToColor("good")).toBe("var(--status-ideal)");
    expect(toneToColor("warn")).toBe("var(--status-warning)");
    expect(toneToColor("bad")).toBe("var(--status-critical)");
    expect(toneToColor("critical")).toBe("var(--status-critical)");
    expect(toneToColor("neutral")).toBe("var(--text-2)");
  });
});

describe("statusFromThreshold", () => {
  it("classifies a higher-is-worse metric (warn <= bad)", () => {
    const o = { warn: 20, bad: 40 };
    expect(statusFromThreshold(10, o)).toBe("ideal");
    expect(statusFromThreshold(20, o)).toBe("warning"); // at warn boundary
    expect(statusFromThreshold(30, o)).toBe("warning");
    expect(statusFromThreshold(40, o)).toBe("critical"); // at bad boundary
    expect(statusFromThreshold(90, o)).toBe("critical");
  });
  it("classifies a lower-is-worse metric when inverted (warn >= bad)", () => {
    const o = { warn: 90, bad: 50, invert: true };
    expect(statusFromThreshold(99, o)).toBe("ideal");
    expect(statusFromThreshold(90, o)).toBe("warning"); // at warn boundary
    expect(statusFromThreshold(70, o)).toBe("warning");
    expect(statusFromThreshold(50, o)).toBe("critical"); // at bad boundary
    expect(statusFromThreshold(10, o)).toBe("critical");
  });
});
