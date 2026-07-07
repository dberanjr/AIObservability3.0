import { describe, expect, it } from "vitest";
import {
  slowTileStatus,
  errorTileStatus,
  loopingTileStatus,
  highFreqTileStatus,
  statusToEmphasis,
} from "./tileStatus";

describe("slowTileStatus", () => {
  it("is warning when any agent is slow, neutral when none", () => {
    expect(slowTileStatus(1)).toBe("warning");
    expect(slowTileStatus(42)).toBe("warning");
    expect(slowTileStatus(0)).toBe("neutral");
  });
});

describe("errorTileStatus", () => {
  it("escalates neutral <=1% → warning 1–5% → critical >5%", () => {
    expect(errorTileStatus(0)).toBe("neutral");
    expect(errorTileStatus(1)).toBe("neutral"); // boundary: strictly >1 to warn
    expect(errorTileStatus(1.1)).toBe("warning");
    expect(errorTileStatus(5)).toBe("warning"); // boundary: strictly >5 to crit
    expect(errorTileStatus(5.1)).toBe("critical");
    expect(errorTileStatus(100)).toBe("critical");
  });
});

describe("loopingTileStatus", () => {
  it("is warning when any loop detected, neutral otherwise", () => {
    expect(loopingTileStatus(3)).toBe("warning");
    expect(loopingTileStatus(0)).toBe("neutral");
  });
});

describe("highFreqTileStatus", () => {
  it("is warning when any agent is flagged, neutral otherwise", () => {
    expect(highFreqTileStatus(1)).toBe("warning");
    expect(highFreqTileStatus(0)).toBe("neutral");
  });
});

describe("statusToEmphasis", () => {
  it("maps each status to the matching StatTile emphasis", () => {
    expect(statusToEmphasis("critical")).toBe("red");
    expect(statusToEmphasis("warning")).toBe("amber");
    expect(statusToEmphasis("good")).toBe("green");
    expect(statusToEmphasis("info")).toBe("default");
    expect(statusToEmphasis("neutral")).toBe("default");
  });
});
