import { describe, expect, it } from "vitest";
import {
  INSTRUMENTATION_CHECKLIST,
  INSTRUMENTATION_CHECKLIST_ANCHOR,
} from "./InstrumentationChecklist";

const items = INSTRUMENTATION_CHECKLIST.flatMap((t) => t.items);

describe("InstrumentationChecklist — data integrity (IA-8)", () => {
  it("exposes a non-empty slug anchor for deep links", () => {
    expect(INSTRUMENTATION_CHECKLIST_ANCHOR).toMatch(/^[a-z][a-z0-9-]+$/);
  });

  it("covers the P0/P1/P2 requirement codes from the requirements doc", () => {
    const codes = items.map((i) => i.code).sort();
    expect(codes).toEqual(
      [
        "P0.1",
        "P0.2",
        "P1.1",
        "P1.2",
        "P1.3",
        "P1.4",
        "P1.5",
        "P2.1",
        "P2.2",
        "P2.3",
        "P2.4",
        "P2.5",
        "P2.6",
        "P2.7",
      ].sort(),
    );
  });

  it("has a plain-language name and at least one attribute chip per item", () => {
    for (const item of items) {
      expect(item.code).toMatch(/^P\d\.\d$/);
      expect(item.name.trim().length).toBeGreaterThan(0);
      // Plain name, not a raw code.
      expect(item.name).not.toMatch(/^P\d\.\d$/);
      expect(item.attributes.length).toBeGreaterThan(0);
      expect(item.unlocks.trim().length).toBeGreaterThan(0);
    }
  });

  it("uses unique requirement codes", () => {
    const codes = items.map((i) => i.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("surfaces the headline recurring asks called out in the brief", () => {
    const allAttrs = items.flatMap((i) => i.attributes);
    // TTFT, session identity, agent trace-context, quality eval scores.
    expect(allAttrs).toContain("gen_ai.response.ttft");
    expect(allAttrs).toContain("session.id");
    expect(allAttrs).toContain("gen_ai.agent.name");
    expect(allAttrs).toContain("gen_ai.evaluation.score.value");
    // Trace-context propagation (P0.1) is the highest-leverage ask.
    expect(items.find((i) => i.code === "P0.1")?.name.toLowerCase()).toContain(
      "trace-context propagation",
    );
  });
});
