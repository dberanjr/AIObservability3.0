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

  it("does NOT flag a multi-fetch query whose AGGREGATE bytes exceed a single-fetch budget", () => {
    // A join stamps scanLimitGBytes on both fetches (2 x 5 GB = 10 GB aggregate
    // budget). 300 GB + 250 GB style: here 3e9 + 2.5e9 = 5.5e9 aggregate — well
    // under the 9.8 GB (98% of 10 GB) aggregate threshold, and neither fetch
    // truncated. Must NOT report a limit hit (the pre-fix false positive).
    const meta = readScanMeta(withGrail({ scannedBytes: 5.5e9 }), 5, 2);
    expect(meta?.limitHit).toBe(false);
  });

  it("flags a multi-fetch query only when it reaches the AGGREGATE budget", () => {
    // 2 fetches x 5 GB = 10 GB aggregate budget; 9.9 GB scanned (>= 98%).
    const meta = readScanMeta(withGrail({ scannedBytes: 9.9e9 }), 5, 2);
    expect(meta?.limitHit).toBe(true);
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

  it("does NOT treat an unrelated (non-scan) limit notification as a scan-limit hit", () => {
    // A maxResultRecords warning is not a truncated scan — the old /LIMIT|SCAN/i
    // match would have falsely tripped on the word 'LIMIT'.
    const meta = readScanMeta(
      withGrail({
        scannedBytes: 1e6,
        notifications: [{ notificationType: "MAX_RESULT_RECORDS_LIMIT", severity: "WARN" }],
      }),
      5000,
    );
    expect(meta?.limitHit).toBe(false);
  });

  it("never flags a limit hit when the budget is unlimited (<=0)", () => {
    const meta = readScanMeta(withGrail({ scannedBytes: 9e15 }), 0);
    expect(meta?.limitHit).toBe(false);
  });
});
