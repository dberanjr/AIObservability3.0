import { describe, expect, it } from "vitest";
import { fmtUSDCents, fmtUSDPrecise, fmtRate } from "./format";

describe("fmtUSDCents", () => {
  it("shows fractional cents (5dp micro-dollars) for comparable sub-cent values", () => {
    // 0.042¢ === $0.00042 — the fractional-cent form keeps micro-values legible.
    expect(fmtUSDCents(0.042)).toBe("0.042¢");
    expect(fmtUSDCents(0.51)).toBe("0.510¢");
  });
  it("shows whole cents between 1¢ and $1", () => {
    expect(fmtUSDCents(1)).toBe("1.00¢");
    expect(fmtUSDCents(42)).toBe("42.00¢");
    expect(fmtUSDCents(99.99)).toBe("99.99¢");
  });
  it("switches to dollars at $1 and above", () => {
    expect(fmtUSDCents(100)).toBe("$1.00");
    expect(fmtUSDCents(250)).toBe("$2.50");
  });
  it("renders zero / negative / invalid as a dash", () => {
    expect(fmtUSDCents(0)).toBe("—");
    expect(fmtUSDCents(-5)).toBe("—");
    expect(fmtUSDCents(NaN)).toBe("—");
  });
  it("stays byte-identical to promptCells.fmtCentsCost so it can delegate", () => {
    // Guard the exact cases promptCells.test.ts pins on fmtCentsCost.
    expect(fmtUSDCents(0.042)).toBe("0.042¢");
    expect(fmtUSDCents(0.51)).toBe("0.510¢");
    expect(fmtUSDCents(250)).toBe("$2.50");
    expect(fmtUSDCents(0)).toBe("—");
    expect(fmtUSDCents(NaN)).toBe("—");
  });
});

describe("fmtUSDPrecise", () => {
  it("defaults to two decimal places with locale grouping", () => {
    expect(fmtUSDPrecise(1234.5)).toBe("$1,234.50");
    expect(fmtUSDPrecise(0)).toBe("$0.00");
  });
  it("honours a custom decimal-place count", () => {
    expect(fmtUSDPrecise(0.00042, 5)).toBe("$0.00042");
    expect(fmtUSDPrecise(1.23456, 4)).toBe("$1.2346");
  });
  it("keeps the sign outside the currency symbol", () => {
    expect(fmtUSDPrecise(-2.5)).toBe("-$2.50");
  });
  it("coerces numeric strings and dashes invalid input", () => {
    expect(fmtUSDPrecise("2.5")).toBe("$2.50");
    expect(fmtUSDPrecise(NaN)).toBe("—");
    expect(fmtUSDPrecise(null)).toBe("—");
  });
});

describe("fmtRate", () => {
  it("compact-formats the magnitude and appends the unit", () => {
    expect(fmtRate(1234, "tok/s")).toBe("1.2k tok/s");
    expect(fmtRate(950, "req/s")).toBe("950 req/s");
    expect(fmtRate(2_500_000, "tok/s")).toBe("2.50M tok/s");
  });
  it("renders invalid input as a bare dash without a unit", () => {
    expect(fmtRate(NaN, "tok/s")).toBe("—");
  });
});
