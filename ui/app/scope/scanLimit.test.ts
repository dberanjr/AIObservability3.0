import { describe, expect, it } from "vitest";
import { injectScanLimit } from "./dqlScanLimit";

/**
 * The scan limit is the single source of truth (the toolbar selector). No query
 * builder hardcodes scanLimitGBytes; useScopedDql injects the selected value
 * into every fetch. These tests lock that injection.
 */
describe("injectScanLimit", () => {
  it("injects the selected scan limit into a fetch that has none", () => {
    const q = "fetch spans, samplingRatio: 1, from: now()-24h\n| filter foo";
    const out = injectScanLimit(q, 2000);
    expect(out).toContain("scanLimitGBytes: 2000");
    // Inserted as a fetch option, before the pipe.
    expect(out.indexOf("scanLimitGBytes: 2000")).toBeLessThan(out.indexOf("|"));
  });

  it("works for fetch logs too", () => {
    expect(injectScanLimit("fetch logs, from: now()-1h | fields x", 750)).toContain(
      "scanLimitGBytes: 750",
    );
  });

  it("normalizes an existing literal to the selector (no stale hardcode wins)", () => {
    const q = "fetch spans, samplingRatio: 1, scanLimitGBytes: 500\n| summarize count()";
    const out = injectScanLimit(q, 100);
    expect(out).toContain("scanLimitGBytes: 100");
    expect(out).not.toContain("scanLimitGBytes: 500");
  });

  it("supports unlimited (-1)", () => {
    expect(injectScanLimit("fetch spans, from: now()-1h", -1)).toContain(
      "scanLimitGBytes: -1",
    );
  });

  it("injects into every fetch (sub-queries / joins included)", () => {
    const q =
      "fetch spans, from: now()-1h | join [ fetch spans, from: now()-1h | fields a ], on: {a}";
    const matches = injectScanLimit(q, 300).match(/scanLimitGBytes: 300/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("does not touch a non-fetch query (smartscape)", () => {
    const q = 'smartscapeEdges type:"calls" | limit 10';
    expect(injectScanLimit(q, 300)).toBe(q);
  });

  it("returns empty input unchanged", () => {
    expect(injectScanLimit("", 300)).toBe("");
  });
});
