import { describe, it, expect } from "vitest";
import { errorRateStatus } from "./serviceStatus";

describe("errorRateStatus", () => {
  it("is good below the 1% warn threshold", () => {
    expect(errorRateStatus(0)).toBe("good");
    expect(errorRateStatus(0.99)).toBe("good");
  });

  it("is warning from 1% up to (but not incl.) 5% — shared statusFromThreshold `>=` boundaries", () => {
    expect(errorRateStatus(1)).toBe("warning");
    expect(errorRateStatus(3)).toBe("warning");
    expect(errorRateStatus(4.99)).toBe("warning");
  });

  it("is critical at or above the 5% bad threshold", () => {
    expect(errorRateStatus(5)).toBe("critical");
    expect(errorRateStatus(100)).toBe("critical");
  });

  it("treats non-finite input as good so a missing rate never alarms", () => {
    expect(errorRateStatus(NaN)).toBe("good");
    expect(errorRateStatus(Infinity)).toBe("good");
  });
});
