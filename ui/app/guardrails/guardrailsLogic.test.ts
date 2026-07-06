import { describe, expect, it } from "vitest";
import {
  shortGuardrailId,
  interventionRate,
  guardrailTone,
  aggregateFleet,
  perBucketRate,
  type GuardrailRow,
} from "./guardrailsLogic";

const row = (over: Partial<GuardrailRow> = {}): GuardrailRow => ({
  arn: "arn:aws:bedrock:us-east-1:207138240216:guardrail/av27tqs1vqe9",
  guardrailId: "av27tqs1vqe9",
  region: "us-east-1",
  account: "207138240216",
  invocations: 100,
  intervened: 5,
  interventionRate: 5,
  avgLatencyMs: 100,
  textUnits: 100,
  ...over,
});

describe("shortGuardrailId", () => {
  it("takes the last ARN segment", () => {
    expect(
      shortGuardrailId("arn:aws:bedrock:us-east-1:207138240216:guardrail/av27tqs1vqe9"),
    ).toBe("av27tqs1vqe9");
  });
  it("degrades gracefully for empty / plain ids", () => {
    expect(shortGuardrailId("")).toBe("—");
    expect(shortGuardrailId("plain-id")).toBe("plain-id");
  });
});

describe("interventionRate", () => {
  it("computes a percentage", () => {
    expect(interventionRate(19, 736)).toBeCloseTo(2.58, 2);
  });
  it("is 0 with no invocations (never divides by zero)", () => {
    expect(interventionRate(0, 0)).toBe(0);
  });
});

describe("guardrailTone", () => {
  it("is quiet when idle (no invocations)", () => {
    expect(guardrailTone(0, 0)).toBe("quiet");
  });
  it("is clean for a low block rate on real traffic", () => {
    expect(guardrailTone(2.6, 736)).toBe("clean");
  });
  it("watches a moderate rate", () => {
    expect(guardrailTone(20, 50)).toBe("watch");
  });
  it("flags a very high rate for attention", () => {
    expect(guardrailTone(100, 4)).toBe("high");
  });
});

describe("aggregateFleet", () => {
  it("rolls up totals, active count, weighted latency, and top intervener", () => {
    const rows = [
      row({ guardrailId: "a", invocations: 736, intervened: 19, avgLatencyMs: 115 }),
      row({ guardrailId: "b", invocations: 730, intervened: 12, avgLatencyMs: 130 }),
      row({ guardrailId: "c", invocations: 0, intervened: 0, avgLatencyMs: 0 }),
    ];
    const f = aggregateFleet(rows);
    expect(f.guardrails).toBe(3);
    expect(f.activeGuardrails).toBe(2);
    expect(f.invocations).toBe(1466);
    expect(f.intervened).toBe(31);
    expect(f.interventionRate).toBeCloseTo((31 / 1466) * 100, 4);
    // weighted: (115*736 + 130*730) / 1466
    expect(f.avgLatencyMs).toBeCloseTo((115 * 736 + 130 * 730) / 1466, 3);
    expect(f.topIntervening?.guardrailId).toBe("a");
  });
  it("has a null top intervener when nothing intervened", () => {
    const f = aggregateFleet([row({ intervened: 0 })]);
    expect(f.topIntervening).toBeNull();
  });
});

describe("perBucketRate", () => {
  it("computes element-wise rate and gaps empty buckets as null", () => {
    expect(perBucketRate([null, 100, 200, 0], [null, 5, 0, 0])).toEqual([
      null,
      5,
      0,
      null,
    ]);
  });
});
