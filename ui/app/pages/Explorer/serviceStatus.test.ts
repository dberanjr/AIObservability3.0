import { describe, it, expect } from "vitest";
import { errorRateStatus } from "./serviceStatus";

describe("errorRateStatus", () => {
  it("is good at or below the 1% threshold", () => {
    expect(errorRateStatus(0)).toBe("good");
    expect(errorRateStatus(1)).toBe("good");
  });

  it("is warning across the 1–5% band (boundaries match the dot's `>` thresholds)", () => {
    expect(errorRateStatus(1.01)).toBe("warning");
    expect(errorRateStatus(3)).toBe("warning");
    expect(errorRateStatus(5)).toBe("warning");
  });

  it("is critical above 5%", () => {
    expect(errorRateStatus(5.01)).toBe("critical");
    expect(errorRateStatus(100)).toBe("critical");
  });

  it("treats non-finite input as good so a missing rate never alarms", () => {
    expect(errorRateStatus(NaN)).toBe("good");
    expect(errorRateStatus(Infinity)).toBe("good");
  });
});
