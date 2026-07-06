import { describe, expect, it } from "vitest";
import { describeFilter, isScopeFiltered, toSidebar } from "./filterScope";

describe("toSidebar", () => {
  it("returns undefined for no filter", () => {
    expect(toSidebar(undefined)).toBeUndefined();
  });
  it("omits client-side-only fields (models / cost ranges)", () => {
    const s = toSidebar({
      services: ["svc"],
      models: ["gpt-4o"],
      onlyErrors: true,
      inCost: { op: "gt", min: 1 },
    });
    expect(s).toMatchObject({ services: ["svc"], onlyErrors: true });
    expect(s).not.toHaveProperty("models");
    expect(s).not.toHaveProperty("inCost");
  });
});

describe("isScopeFiltered", () => {
  it("is false for an empty filter and no focus", () => {
    expect(isScopeFiltered({}, null)).toBe(false);
    expect(isScopeFiltered(undefined, null)).toBe(false);
  });
  it("is true when a focus is active", () => {
    expect(isScopeFiltered({}, "llm-rate-limit")).toBe(true);
  });
  it("detects facets, toggles, ranges and search", () => {
    expect(isScopeFiltered({ services: ["a"] })).toBe(true);
    expect(isScopeFiltered({ onlyPii: true })).toBe(true);
    expect(isScopeFiltered({ latency: { op: "gt", min: 1 } })).toBe(true);
    expect(isScopeFiltered({ search: "hi" })).toBe(true);
    expect(isScopeFiltered({ search: "  " })).toBe(false);
  });
});

describe("describeFilter", () => {
  it("lists the active constraints, focus first", () => {
    const out = describeFilter(
      { services: ["a", "b"], onlyErrors: true, latency: { op: "gt", min: 1 } },
      "Provider rate-limit",
    );
    expect(out[0]).toBe("pattern: Provider rate-limit");
    expect(out).toContain("AI app: a, b");
    expect(out).toContain("errors");
    expect(out).toContain("duration range");
  });
  it("is empty when nothing is active", () => {
    expect(describeFilter({}, null)).toEqual([]);
  });
  it("truncates long value lists", () => {
    const out = describeFilter({ models: ["a", "b", "c", "d"] });
    expect(out[0]).toBe("model: a, b, c…");
  });
});
