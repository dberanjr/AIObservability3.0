import { describe, expect, it } from "vitest";
import {
  fmtBudgetPct,
  fmtScanBytes,
  fmtSecs1,
  scanBudgetFraction,
  scanBudgetSeverity,
} from "./format";

describe("fmtScanBytes", () => {
  it("uses decimal (1000-based) TB/GB/MB units to match scanLimitGBytes", () => {
    expect(fmtScanBytes(5e12)).toBe("5.0 TB");
    expect(fmtScanBytes(2.5e9)).toBe("2.5 GB");
    expect(fmtScanBytes(340e6)).toBe("340.0 MB");
  });

  it("floors a real but tiny scan at 0.1 MB so it never reads as 0", () => {
    expect(fmtScanBytes(1000)).toBe("0.1 MB");
    expect(fmtScanBytes(50_000)).toBe("0.1 MB");
  });

  it("renders an exact zero and non-numeric input distinctly", () => {
    expect(fmtScanBytes(0)).toBe("0.0 MB");
    expect(fmtScanBytes(null)).toBe("—");
    expect(fmtScanBytes(undefined)).toBe("—");
  });

  it("coerces numeric strings (DQL sometimes returns numbers as strings)", () => {
    expect(fmtScanBytes("7500000000")).toBe("7.5 GB");
  });
});

describe("fmtSecs1", () => {
  it("renders milliseconds as seconds with one decimal", () => {
    expect(fmtSecs1(1400)).toBe("1.4s");
    expect(fmtSecs1(800)).toBe("0.8s");
    expect(fmtSecs1(0)).toBe("0.0s");
  });

  it("returns the em dash for non-numeric input", () => {
    expect(fmtSecs1(null)).toBe("—");
    expect(fmtSecs1("nope")).toBe("—");
  });
});

describe("scanBudgetFraction", () => {
  it("divides scanned bytes by the per-fetch limit times the query count", () => {
    // 7 queries x 500 GB = 3.5 TB page budget; scanned 1.2 TB -> ~0.343.
    const f = scanBudgetFraction(1.2e12, 500, 7);
    expect(f).toBeCloseTo(1.2e12 / (500e9 * 7), 6);
  });

  it("returns null when the budget is unlimited (scanLimitGb <= 0)", () => {
    expect(scanBudgetFraction(9e12, 0, 5)).toBeNull();
    expect(scanBudgetFraction(9e12, -1, 5)).toBeNull();
  });

  it("returns null with no queries or non-numeric bytes", () => {
    expect(scanBudgetFraction(1e9, 500, 0)).toBeNull();
    expect(scanBudgetFraction(null, 500, 3)).toBeNull();
  });

  it("can exceed 1 (a multi-fetch query scans past a single per-fetch cap)", () => {
    // 1 dedup'd query but a join scanned ~1 TB against a 500 GB single-cap.
    const f = scanBudgetFraction(1e12, 500, 1);
    expect(f).toBeGreaterThan(1);
  });

  it("coerces numeric strings", () => {
    expect(scanBudgetFraction("500000000000", 500, 1)).toBeCloseTo(1, 6);
  });
});

describe("scanBudgetSeverity", () => {
  it("bands a fraction into ok / warn / crit", () => {
    expect(scanBudgetSeverity(0.3)).toBe("ok");
    expect(scanBudgetSeverity(0.79)).toBe("ok");
    expect(scanBudgetSeverity(0.8)).toBe("warn");
    expect(scanBudgetSeverity(0.99)).toBe("warn");
    expect(scanBudgetSeverity(1)).toBe("crit");
    expect(scanBudgetSeverity(2.5)).toBe("crit");
  });

  it("treats a null fraction (unlimited budget) as ok", () => {
    expect(scanBudgetSeverity(null)).toBe("ok");
  });
});

describe("fmtBudgetPct", () => {
  it("renders a whole-percent label", () => {
    expect(fmtBudgetPct(0.343)).toBe("34%");
    expect(fmtBudgetPct(0.006)).toBe("1%");
    expect(fmtBudgetPct(1)).toBe("100%");
  });

  it("is empty for a null fraction", () => {
    expect(fmtBudgetPct(null)).toBe("");
  });
});
