import { describe, expect, it } from "vitest";
import { statusColor } from "../../theme/statusColor";
import {
  classifyVerdict,
  coverageRampColor,
  SPARSE_SHARE_THRESHOLD,
  VERDICT_COLOR,
  VERDICT_STATUS,
} from "./coverage";

describe("classifyVerdict", () => {
  it("returns missing when the attribute is absent", () => {
    expect(classifyVerdict(false, 0)).toBe("missing");
    // share is irrelevant when not present
    expect(classifyVerdict(false, 0.9)).toBe("missing");
  });

  it("returns sparse when present but below the share threshold", () => {
    expect(classifyVerdict(true, 0)).toBe("sparse");
    expect(classifyVerdict(true, 0.000001)).toBe("sparse");
    expect(classifyVerdict(true, SPARSE_SHARE_THRESHOLD - 0.0001)).toBe("sparse");
  });

  it("returns present at or above the share threshold", () => {
    expect(classifyVerdict(true, SPARSE_SHARE_THRESHOLD)).toBe("present");
    expect(classifyVerdict(true, 0.5)).toBe("present");
    expect(classifyVerdict(true, 1)).toBe("present");
  });

  it("maps every verdict to a distinct color token", () => {
    expect(VERDICT_COLOR.present).not.toBe(VERDICT_COLOR.sparse);
    expect(VERDICT_COLOR.sparse).not.toBe(VERDICT_COLOR.missing);
    expect(VERDICT_COLOR.present).not.toBe(VERDICT_COLOR.missing);
  });

  it("routes verdict severity through the shared statusColor ramp", () => {
    // present=good, sparse=warning, missing=critical — one severity ramp for
    // the whole app rather than a hardcoded green/amber/red on this page.
    expect(VERDICT_STATUS.present).toBe("good");
    expect(VERDICT_STATUS.sparse).toBe("warning");
    expect(VERDICT_STATUS.missing).toBe("critical");
    expect(VERDICT_COLOR.present).toBe(statusColor("good"));
    expect(VERDICT_COLOR.sparse).toBe(statusColor("warning"));
    expect(VERDICT_COLOR.missing).toBe(statusColor("critical"));
  });
});

describe("coverageRampColor", () => {
  it("is neutral when there are no attributes", () => {
    expect(coverageRampColor(0, 0)).toBe("var(--text-3)");
  });

  it("snaps to red at exactly zero coverage", () => {
    expect(coverageRampColor(0, 20)).toBe("var(--red)");
  });

  it("snaps to green at full coverage", () => {
    expect(coverageRampColor(20, 20)).toBe("var(--green-2)");
    // over-full (defensive) still reads green
    expect(coverageRampColor(21, 20)).toBe("var(--green-2)");
  });

  it("interpolates amber→green by ratio in between", () => {
    const half = coverageRampColor(2, 4);
    expect(half).toContain("var(--green-2) 50%");
    expect(half).toContain("var(--amber)");

    const nearlyDone = coverageRampColor(18, 20);
    expect(nearlyDone).toContain("var(--green-2) 90%");

    const barelyStarted = coverageRampColor(2, 20);
    expect(barelyStarted).toContain("var(--green-2) 10%");
  });

  it("gives a higher green weight to better-covered sections", () => {
    // 18/20 must read greener than 2/20 — the whole point of the graduated ramp.
    const good = coverageRampColor(18, 20);
    const poor = coverageRampColor(2, 20);
    expect(good).not.toBe(poor);
  });
});
