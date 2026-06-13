import { describe, it, expect } from "vitest";
import {
  bt,
  anyPresent,
  firstNonNull,
  CAPABILITIES,
  CAPABILITY_IDS,
  AI_SPAN_POPULATION,
} from "./attributeFields";

/** Every back-ticked attribute path referenced anywhere in a string. */
const pathsIn = (s: string): string[] =>
  Array.from(s.matchAll(/`([^`]+)`/g)).map((m) => m[1]);

describe("DQL field helpers", () => {
  it("back-ticks a dotted path", () => {
    expect(bt("gen_ai.usage.cost")).toBe("`gen_ai.usage.cost`");
  });

  it("anyPresent ORs an isNotNull per spelling", () => {
    expect(anyPresent("a.b", "c.d")).toBe(
      "isNotNull(`a.b`) or isNotNull(`c.d`)",
    );
  });

  it("firstNonNull is a bare field for one path, coalesce for many", () => {
    expect(firstNonNull("a.b")).toBe("`a.b`");
    expect(firstNonNull("a.b", "c.d")).toBe("coalesce(`a.b`, `c.d`)");
  });
});

describe("capability registry", () => {
  it("has unique ids matching CAPABILITY_IDS", () => {
    const ids = CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CAPABILITY_IDS).toEqual(ids);
  });

  it("every predicate tests at least one attribute via isNotNull", () => {
    for (const c of CAPABILITIES) {
      expect(c.predicate).toContain("isNotNull(");
      expect(pathsIn(c.predicate).length).toBeGreaterThan(0);
    }
  });

  // NOTE: the catalog drift-guard tests ("only gates on attributes catalogued
  // by the Audit page" / "references catalog section ids that exist") moved out
  // with the AI Attributes Audit catalog when that tab was extracted into its
  // own app. The capability registry is now self-contained here.

  it("probes a non-empty AI-span population", () => {
    expect(pathsIn(AI_SPAN_POPULATION).length).toBeGreaterThan(0);
  });
});
