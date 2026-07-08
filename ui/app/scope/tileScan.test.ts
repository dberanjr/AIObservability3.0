import { describe, expect, it } from "vitest";
import type { ScanEntry } from "./ScanReportContext";
import { computeTileReport } from "./tileScan";

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

// Generic behavior (no page-specific opts): identity titles, deterministic
// ownership by smallest group id, ungrouped queries attributed to nobody.
describe("computeTileReport (generic defaults)", () => {
  it("attributes a tile's unique query to itself with no inheritance", () => {
    const r = computeTileReport([entry("models:cost", "Q1", 3e9)], "models:cost");
    expect(r.owned?.scannedBytes).toBe(3e9);
    expect(r.owned?.queryCount).toBe(1);
    expect(r.inheritedFrom).toEqual([]);
  });

  it("credits a shared query to the smallest-id group and marks the rest inherited", () => {
    const entries = [
      entry("agents:a", "Qs", 1e9),
      entry("prompts:b", "Qs", 1e9),
      entry("prompts:b", "Qb", 2e9),
    ];
    // "agents:a" < "prompts:b" lexicographically → agents owns the shared query.
    const a = computeTileReport(entries, "agents:a");
    expect(a.owned?.scannedBytes).toBe(1e9);
    expect(a.inheritedFrom).toEqual([]);
    const b = computeTileReport(entries, "prompts:b");
    expect(b.owned?.scannedBytes).toBe(2e9);
    expect(b.inheritedFrom).toEqual(["agents:a"]);
    // Owned bytes partition the deduped page total (3 GB), not 4 GB.
    expect((a.owned?.scannedBytes ?? 0) + (b.owned?.scannedBytes ?? 0)).toBe(3e9);
  });

  it("ignores ungrouped queries when no ungroupedAs is set", () => {
    const r = computeTileReport([entry(null, "Qroot", 5e9)], "some:tile");
    expect(r.owned).toBeNull();
  });

  it("deduplicates a query a tile registers more than once", () => {
    const r = computeTileReport(
      [entry("x:t", "Q", 4e9), entry("x:t", "Q", 4e9)],
      "x:t",
    );
    expect(r.owned?.queryCount).toBe(1);
    expect(r.owned?.scannedBytes).toBe(4e9);
  });

  it("propagates a scan-limit hit", () => {
    const r = computeTileReport(
      [entry("x:t", "Q", 2e9, { limitHit: true })],
      "x:t",
    );
    expect(r.limitHit).toBe(true);
  });

  it("resolves inherited titles via titleOf", () => {
    const entries = [entry("a", "Qs", 1e9), entry("b", "Qs", 1e9), entry("b", "Qb", 2e9)];
    const r = computeTileReport(entries, "b", {
      titleOf: (g) => (g === "a" ? "Tile A" : g),
    });
    expect(r.inheritedFrom).toEqual(["Tile A"]);
  });

  it("honors ungroupedAs to attribute page-root queries to a tile", () => {
    const r = computeTileReport([entry(null, "Qroot", 5e9)], "hero", {
      ungroupedAs: "hero",
    });
    expect(r.owned?.scannedBytes).toBe(5e9);
  });
});
