import { describe, expect, it } from "vitest";
import type { ScanEntry } from "../../scope/ScanReportContext";
import { computeTileReport } from "../../scope/tileScan";
import { SUMMARY_SCAN_OPTS } from "./summaryScanGroups";

const entry = (
  group: string | null,
  query: string,
  scannedBytes: number,
  extra: Partial<ScanEntry> = {},
): ScanEntry => ({
  group,
  query,
  scannedBytes,
  executionMs: extra.executionMs ?? 100,
  limitHit: extra.limitHit ?? false,
});

// Summary passes its curated ownership priority + titles via SUMMARY_SCAN_OPTS.
const report = (entries: ScanEntry[], group: string | null) =>
  computeTileReport(entries, group, SUMMARY_SCAN_OPTS);

describe("computeTileReport (Summary opts)", () => {
  it("attributes a tile's unique query to itself with no inheritance", () => {
    const r = report([entry("finops", "Q_finops", 3e9)], "finops");
    expect(r.owned?.scannedBytes).toBe(3e9);
    expect(r.owned?.queryCount).toBe(1);
    expect(r.inheritedFrom).toEqual([]);
  });

  it("credits a shared query to the highest-priority owner and marks the rest inherited", () => {
    const entries = [
      entry("hidden", "Q_hidden", 1e9),
      entry("posture", "Q_hidden", 1e9),
      entry("posture", "Q_dailyspend", 2e9),
      entry("quality", "Q_hidden", 1e9),
      entry("quality", "Q_agenteval", 3e9),
    ];

    const hidden = report(entries, "hidden");
    expect(hidden.owned?.scannedBytes).toBe(1e9); // owns the shared query
    expect(hidden.inheritedFrom).toEqual([]);

    const posture = report(entries, "posture");
    expect(posture.owned?.scannedBytes).toBe(2e9); // only its unique dailyspend
    expect(posture.inheritedFrom).toEqual(["Hidden · 200-OK"]);

    const quality = report(entries, "quality");
    expect(quality.owned?.scannedBytes).toBe(3e9); // only its unique agenteval
    expect(quality.inheritedFrom).toEqual(["Hidden · 200-OK"]);

    // ACCURACY INVARIANT: owned bytes partition the distinct queries exactly, so
    // they sum to the deduplicated page total (6 GB), never double-counting the
    // 1 GB shared scan.
    const sumOwned =
      (hidden.owned?.scannedBytes ?? 0) +
      (posture.owned?.scannedBytes ?? 0) +
      (quality.owned?.scannedBytes ?? 0);
    expect(sumOwned).toBe(6e9);
  });

  it("treats ungrouped (page-root) queries as the hero's", () => {
    const r = report([entry(null, "Q_summary", 5e9)], "posture");
    expect(r.owned?.scannedBytes).toBe(5e9);
  });

  it("deduplicates a query a tile registers more than once", () => {
    const r = report(
      [entry("agents", "Q_agents", 4e9), entry("agents", "Q_agents", 4e9)],
      "agents",
    );
    expect(r.owned?.queryCount).toBe(1);
    expect(r.owned?.scannedBytes).toBe(4e9);
  });

  it("propagates a scan-limit hit for the tile", () => {
    const r = report(
      [entry("activity", "Q_activity", 2e9, { limitHit: true })],
      "activity",
    );
    expect(r.limitHit).toBe(true);
  });

  it("returns an empty report for a tile with no queries", () => {
    const r = report([entry("finops", "Q_finops", 1e9)], "efficiency");
    expect(r.owned).toBeNull();
    expect(r.inheritedFrom).toEqual([]);
  });
});
