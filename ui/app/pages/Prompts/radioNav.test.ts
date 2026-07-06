import { describe, expect, it } from "vitest";
import { nextRadioIndex, radioTabIndex } from "./radioNav";

describe("radioTabIndex", () => {
  it("gives the active radio the only tab stop", () => {
    expect(radioTabIndex(true)).toBe(0);
    expect(radioTabIndex(false)).toBe(-1);
  });
});

describe("nextRadioIndex", () => {
  it("wraps forward and backward", () => {
    expect(nextRadioIndex(3, 0, "ArrowRight")).toBe(1);
    expect(nextRadioIndex(3, 2, "ArrowRight")).toBe(0);
    expect(nextRadioIndex(3, 0, "ArrowLeft")).toBe(2);
    expect(nextRadioIndex(3, 1, "ArrowDown")).toBe(2);
    expect(nextRadioIndex(3, 1, "ArrowUp")).toBe(0);
  });
  it("jumps to ends", () => {
    expect(nextRadioIndex(4, 2, "Home")).toBe(0);
    expect(nextRadioIndex(4, 1, "End")).toBe(3);
  });
  it("ignores non-navigation keys and empty groups", () => {
    expect(nextRadioIndex(3, 0, "Enter")).toBeNull();
    expect(nextRadioIndex(0, 0, "ArrowRight")).toBeNull();
  });
});
