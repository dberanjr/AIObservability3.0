import { describe, expect, it } from "vitest";
import {
  qualityColor,
  tempColor,
  anomalyLevel,
  fmtCentsCost,
  coverageLabel,
} from "./promptCells";

describe("qualityColor", () => {
  it("reserves red for genuine failure", () => {
    expect(qualityColor(59)).toBe("var(--red)");
    expect(qualityColor(70)).toBe("var(--amber)");
    expect(qualityColor(90)).toBe("var(--green-2)");
  });
  it("inverts for hallucination-style metrics", () => {
    expect(qualityColor(12, true)).toBe("var(--red)");
    expect(qualityColor(5, true)).toBe("var(--amber)");
    expect(qualityColor(1, true)).toBe("var(--green-2)");
  });
  it("greys out a null score", () => {
    expect(qualityColor(null)).toBe("var(--text-4)");
  });
});

describe("tempColor", () => {
  it("never returns a failure-red for a benign high temperature", () => {
    // The hot end is a magenta mix, not pure var(--red).
    expect(tempColor(1)).not.toBe("var(--red)");
    expect(tempColor(0.9)).toContain("var(--purple)");
  });
  it("ramps blue (cold) → purple (hot)", () => {
    expect(tempColor(0.1)).toBe("var(--blue)");
    expect(tempColor(0.8)).toBe("var(--purple)");
  });
});

describe("anomalyLevel", () => {
  const t = { p90: 100, p98: 200 };
  it("classifies against thresholds", () => {
    expect(anomalyLevel(50, t)).toBe("none");
    expect(anomalyLevel(150, t)).toBe("elevated");
    expect(anomalyLevel(250, t)).toBe("outlier");
  });
  it("is inert without thresholds or for non-positive values", () => {
    expect(anomalyLevel(999, null)).toBe("none");
    expect(anomalyLevel(0, t)).toBe("none");
  });
});

describe("fmtCentsCost", () => {
  it("shows fixed-magnitude fractional cents for comparable sub-cent values", () => {
    expect(fmtCentsCost(0.042)).toBe("0.042¢");
    expect(fmtCentsCost(0.51)).toBe("0.510¢");
  });
  it("switches to dollars past $1", () => {
    expect(fmtCentsCost(250)).toBe("$2.50");
  });
  it("renders zero / invalid as a dash", () => {
    expect(fmtCentsCost(0)).toBe("—");
    expect(fmtCentsCost(NaN)).toBe("—");
  });
});

describe("coverageLabel", () => {
  it("expresses coverage as a fraction of the population", () => {
    const c = coverageLabel(18, 50000);
    expect(c.text).toBe("18 of 50,000 LLM spans scored (0.04%)");
    expect(c.low).toBe(true);
  });
  it("does not flag healthy coverage as low", () => {
    const c = coverageLabel(400, 1000);
    expect(c.low).toBe(false);
    expect(c.text).toContain("40%");
  });
  it("falls back to a bare count when the population is unknown", () => {
    expect(coverageLabel(18, 0).text).toBe("18 spans with this attribute");
  });
});
