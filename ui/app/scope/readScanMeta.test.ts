import { describe, expect, it } from "vitest";
import { readScanMeta } from "./ScanReportContext";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const withGrail = (grail: unknown): any => ({ data: { metadata: { grail } } });

describe("readScanMeta", () => {
  it("returns null when the result carries no Grail metadata", () => {
    expect(readScanMeta({ data: undefined }, 5000)).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(readScanMeta({ data: { records: [] } } as any, 5000)).toBeNull();
  });

  it("extracts scanned bytes and execution time", () => {
    const meta = readScanMeta(
      withGrail({ scannedBytes: 2.5e9, executionTimeMilliseconds: 1400 }),
      5000,
    );
    expect(meta).toEqual({ scannedBytes: 2.5e9, executionMs: 1400, limitHit: false });
  });

  it("flags a limit hit when the scan reaches ~all of the budget", () => {
    // 5 GB budget, scanned 4.95 GB (>= 98%).
    const meta = readScanMeta(withGrail({ scannedBytes: 4.95e9 }), 5);
    expect(meta?.limitHit).toBe(true);
  });

  it("does not flag a limit hit well under budget", () => {
    const meta = readScanMeta(withGrail({ scannedBytes: 1e9 }), 5);
    expect(meta?.limitHit).toBe(false);
  });

  it("treats a scan-limit notification as a hit regardless of bytes", () => {
    const meta = readScanMeta(
      withGrail({
        scannedBytes: 1e6,
        notifications: [{ notificationType: "SCAN_LIMIT_REACHED", severity: "WARN" }],
      }),
      5000,
    );
    expect(meta?.limitHit).toBe(true);
  });

  it("never flags a limit hit when the budget is unlimited (<=0)", () => {
    const meta = readScanMeta(withGrail({ scannedBytes: 9e15 }), 0);
    expect(meta?.limitHit).toBe(false);
  });
});
