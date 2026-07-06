import { describe, expect, it } from "vitest";
import { fmtScanBytes, fmtSecs1 } from "./format";

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
