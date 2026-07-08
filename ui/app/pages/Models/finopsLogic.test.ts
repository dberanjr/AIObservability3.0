import { describe, expect, it } from "vitest";
import {
  assignSeriesColors,
  buildConcentrationSegments,
  computePossibleSavings,
  inferModelType,
  median,
  pickWithinTypeDowngrade,
} from "./finopsLogic";

const model = (
  modelKey: string,
  type: ReturnType<typeof inferModelType>,
  costPerMTok: number,
  pricingUnknown = false,
) => ({ modelKey, type, costPerMTok, pricingUnknown });

describe("pickWithinTypeDowngrade", () => {
  it("does NOT pair an embedding against a generative model", () => {
    // Opus (generative, $15) vs an embedding ($0.02) — a >3x ratio exists but
    // across types, which is the incoherent swap we must suppress.
    const pair = pickWithinTypeDowngrade([
      model("opus", "generative", 15),
      model("embed", "embedding", 0.02),
    ]);
    expect(pair).toBeNull();
  });

  it("pairs the priciest and cheapest generative models when ratio > 3", () => {
    const pair = pickWithinTypeDowngrade([
      model("opus", "generative", 15),
      model("haiku", "generative", 1),
      model("embed", "embedding", 0.02),
    ]);
    expect(pair).not.toBeNull();
    expect(pair!.expensive.modelKey).toBe("opus");
    expect(pair!.cheap.modelKey).toBe("haiku");
    expect(pair!.ratio).toBe(15);
  });

  it("returns null when the within-type ratio is under the threshold", () => {
    const pair = pickWithinTypeDowngrade([
      model("a", "generative", 10),
      model("b", "generative", 5),
    ]);
    expect(pair).toBeNull();
  });

  it("ignores unpriced models", () => {
    const pair = pickWithinTypeDowngrade([
      model("opus", "generative", 15),
      model("mystery", "generative", 0, true),
    ]);
    expect(pair).toBeNull();
  });
});

describe("computePossibleSavings", () => {
  it("does not compare embedding services against generative ones", () => {
    // A generative service at 30 $/MTok next to an embedding service at 0.02
    // must NOT be flagged — the ratio is cross-type noise.
    const savings = computePossibleSavings([
      { costPerMTok: 30, tokens: 1_000_000, cost: 30, topModel: "claude-opus" },
      { costPerMTok: 0.02, tokens: 1_000_000, cost: 0.02, topModel: "text-embedding-3-small" },
    ]);
    expect(savings).toBe(0);
  });

  it("sums half-savings only within the same type", () => {
    // Two generative services: expensive (10 $/MTok) vs cheap (1 $/MTok).
    // target = tokens/1e6 * cheapest * 2 = 1 * 1 * 2 = 2; savings = 10 - 2 = 8.
    const savings = computePossibleSavings([
      { costPerMTok: 10, tokens: 1_000_000, cost: 10, topModel: "claude-opus" },
      { costPerMTok: 1, tokens: 1_000_000, cost: 1, topModel: "claude-haiku" },
    ]);
    expect(savings).toBe(8);
  });
});

describe("median", () => {
  it("returns 0 for an empty list", () => {
    expect(median([])).toBe(0);
  });
  it("returns the middle of an odd list", () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it("averages the two middles of an even list", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("buildConcentrationSegments", () => {
  it("sizes each segment by cost share summing to 100", () => {
    const segs = buildConcentrationSegments([
      { service: "a", cost: 80, topModel: "claude-opus" },
      { service: "b", cost: 20, topModel: "gpt-4o" },
    ]);
    expect(segs).toHaveLength(2);
    expect(segs[0].share).toBeCloseTo(80);
    expect(segs[1].share).toBeCloseTo(20);
    const total = segs.reduce((acc, s) => acc + s.share, 0);
    expect(total).toBeCloseTo(100);
  });

  it("rolls the tail beyond topN into an Other segment", () => {
    const services = Array.from({ length: 5 }, (_, i) => ({
      service: `s${i}`,
      cost: 10,
      topModel: "gpt-4o",
    }));
    const segs = buildConcentrationSegments(services, 3);
    expect(segs).toHaveLength(4);
    const other = segs[segs.length - 1];
    expect(other.isOther).toBe(true);
    expect(other.cost).toBe(20);
  });

  it("drops zero-cost services", () => {
    const segs = buildConcentrationSegments([
      { service: "a", cost: 100, topModel: "gpt-4o" },
      { service: "b", cost: 0, topModel: "gpt-4o" },
    ]);
    expect(segs).toHaveLength(1);
  });
});

describe("assignSeriesColors", () => {
  it("gives the first series of a provider its base hue", () => {
    const colors = assignSeriesColors(["gpt-4o"]);
    expect(colors.get("gpt-4o")).toBe("var(--green-2)");
  });

  it("shades a second series from the same provider differently", () => {
    const colors = assignSeriesColors(["gpt-4o", "gpt-4o-mini"]);
    expect(colors.get("gpt-4o")).toBe("var(--green-2)");
    expect(colors.get("gpt-4o-mini")).not.toBe(colors.get("gpt-4o"));
  });

  it("assigns Other a neutral color", () => {
    const colors = assignSeriesColors(["Other"]);
    expect(colors.get("Other")).toBe("var(--text-4)");
  });
});
