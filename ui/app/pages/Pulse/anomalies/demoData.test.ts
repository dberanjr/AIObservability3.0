import { describe, expect, it } from "vitest";
import { DEMO_ANOMALIES } from "./demoData";
import { SEVERITY_RANK } from "./types";

describe("Pulse anomalies demo dataset", () => {
  it("is non-empty and every finding has the required Finding fields", () => {
    expect(DEMO_ANOMALIES.length).toBeGreaterThan(0);
    for (const f of DEMO_ANOMALIES) {
      expect(f.id).toBeTruthy();
      expect(f.category).toBeTruthy();
      expect(f.entity).toBeTruthy();
      expect(f.metric).toBeTruthy();
      expect(f.context).toBeTruthy();
      expect(["info", "warning", "critical"]).toContain(f.severity);
    }
  });

  it("ids are unique", () => {
    const ids = DEMO_ANOMALIES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is sorted by severity, most severe first — matching the real hook's sort", () => {
    for (let i = 1; i < DEMO_ANOMALIES.length; i++) {
      expect(SEVERITY_RANK[DEMO_ANOMALIES[i - 1].severity]).toBeGreaterThanOrEqual(
        SEVERITY_RANK[DEMO_ANOMALIES[i].severity],
      );
    }
  });

  it("includes at least one critical finding (the runaway agent) to lead the strip", () => {
    expect(DEMO_ANOMALIES.some((f) => f.severity === "critical")).toBe(true);
  });

  it("reuses the same agent names as the rest of Pulse's demo cast", () => {
    const entities = DEMO_ANOMALIES.map((f) => f.entity).join(" ");
    expect(entities).toMatch(/refund-adjudicator|trip-planner-agent/);
  });
});
