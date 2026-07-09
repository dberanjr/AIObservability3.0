import { describe, expect, it } from "vitest";
import {
  parseGovKpis,
  parseApiActions,
  parseCrossRegion,
  parseIdentityMfa,
  regionFamily,
  isResidencyException,
  foldGovTimeseries,
} from "./parse";

describe("parseGovKpis", () => {
  it("coerces the single summarize row's string counts to numbers", () => {
    const kpis = parseGovKpis([
      {
        totalCalls: "2125",
        distinctIdentities: "19",
        distinctSourceIps: "33",
        distinctAccounts: "4",
        erroredCalls: "28",
        nonMfaCalls: "1718",
        crossRegionCalls: "851",
      },
    ]);
    expect(kpis.totalCalls).toBe(2125);
    expect(kpis.distinctIdentities).toBe(19);
    expect(kpis.crossRegionCalls).toBe(851);
  });
  it("returns all-zero on an empty result", () => {
    expect(parseGovKpis([]).totalCalls).toBe(0);
  });
});

describe("parseApiActions", () => {
  it("drops rows with no eventName", () => {
    const rows = parseApiActions([
      { eventName: "ConverseStream", calls: "1740" },
      { eventName: null, calls: "3" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ eventName: "ConverseStream", calls: 1740 });
  });
});

describe("parseIdentityMfa", () => {
  it("surfaces a null mfa as 'n/a' rather than coercing to false", () => {
    const rows = parseIdentityMfa([
      { identity_name: "svc-role", mfa: null, calls: "10", source_ips: "2" },
      { identity_name: "user-a", mfa: "false", calls: "5", source_ips: "1" },
    ]);
    expect(rows[0].mfa).toBe("n/a");
    expect(rows[1].mfa).toBe("false");
  });
});

describe("region residency policy", () => {
  it("extracts the geography family prefix", () => {
    expect(regionFamily("us-east-1")).toBe("us");
    expect(regionFamily("ap-northeast-2")).toBe("ap");
    expect(regionFamily("")).toBe("");
  });
  it("flags only cross-COUNTRY inference as a residency exception", () => {
    // same-family cross-region (us-east-1 → us-east-2) is normal, not a flag
    expect(isResidencyException("us-east-1", "us-east-2")).toBe(false);
    // out-of-country (us → ap) is a flag
    expect(isResidencyException("us-east-1", "ap-northeast-2")).toBe(true);
    // identical / empty never flags
    expect(isResidencyException("us-east-1", "us-east-1")).toBe(false);
    expect(isResidencyException("", "ap-southeast-4")).toBe(false);
  });
});

describe("parseCrossRegion", () => {
  it("keeps only rows with an inferenceRegion", () => {
    const rows = parseCrossRegion([
      { region: "us-east-1", inferenceRegion: "us-east-2", calls: "759" },
      { region: "us-east-1", inferenceRegion: null, calls: "78" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].calls).toBe(759);
  });
});

describe("foldGovTimeseries", () => {
  const records = [
    { eventName: "InvokeModel", calls: [1, null, 2], timeframe: { start: "2026-07-01T00:00:00Z" }, interval: 3_600_000_000_000 },
    { eventName: "ConverseStream", calls: [10, 20, null], timeframe: { start: "2026-07-01T00:00:00Z" }, interval: 3_600_000_000_000 },
  ];
  it("builds one label per bucket and coerces null slots to 0", () => {
    const ts = foldGovTimeseries(records, "calls", "eventName");
    expect(ts.labels).toHaveLength(3);
    const converse = ts.series.find((s) => s.key === "ConverseStream");
    expect(converse?.values).toEqual([10, 20, 0]);
    const invoke = ts.series.find((s) => s.key === "InvokeModel");
    expect(invoke?.values).toEqual([1, 0, 2]);
  });
  it("sorts series by total desc (busiest first)", () => {
    const ts = foldGovTimeseries(records, "calls", "eventName");
    expect(ts.series[0].key).toBe("ConverseStream"); // 30 > 3
  });
  it("handles an empty result", () => {
    const ts = foldGovTimeseries([], "calls", "eventName");
    expect(ts.labels).toEqual([]);
    expect(ts.series).toEqual([]);
  });
});
