import { describe, it, expect } from "vitest";
import { assembleUpstreamGraph, topCallersByVolume, sortCallers } from "./upstreamGraph";

const reds = [
  { svcId: "S1", svc: "alpha", requests: 100, errors: 1, p90ns: 9_000_000, p95ns: 14_000_000 },
  { svcId: "S2", svc: "bravo", requests: 300, errors: 0, p90ns: 2_000_000, p95ns: 3_000_000 },
];
const edges = [
  { upstreamId: "S1", upstream: "alpha", aiServiceId: "A1", aiService: "svc-a" },
  { upstreamId: "S2", upstream: "bravo", aiServiceId: "A1", aiService: "svc-a" },
  { upstreamId: "S2", upstream: "bravo", aiServiceId: "A2", aiService: "svc-b" },
];
const comps = [
  { svcId: "A1", agents: ["planner"], tools: ["sql"], models: ["Claude Sonnet 4.6"] },
  { svcId: "A2", agents: [], tools: [], models: ["Titan Embed"] },
];

describe("assembleUpstreamGraph", () => {
  it("builds callers with derived rates, aiServiceIds, and dedup services", () => {
    const g = assembleUpstreamGraph({ reds, edges, components: comps, windowMinutes: 60 });
    const s1 = g.callers.find((c) => c.id === "S1")!;
    expect(s1.errPct).toBeCloseTo(1); // 1/100
    expect(s1.p90Ms).toBe(9);
    expect(s1.p95Ms).toBe(14);
    expect(s1.throughputPerMin).toBeCloseTo(100 / 60);
    const s2 = g.callers.find((c) => c.id === "S2")!;
    expect(s2.aiServiceIds.sort()).toEqual(["A1", "A2"]);
    expect(g.services.map((s) => s.id).sort()).toEqual(["A1", "A2"]);
    expect(g.services.find((s) => s.id === "A1")!.models).toEqual(["Claude Sonnet 4.6"]);
    expect(g.edges.length).toBe(3);
  });

  it("callers with no RED row still appear from edges (quiet callers)", () => {
    const g = assembleUpstreamGraph({
      reds: [],
      edges: [{ upstreamId: "S9", upstream: "quiet", aiServiceId: "A1", aiService: "svc-a" }],
      components: [],
      windowMinutes: 60,
    });
    expect(g.callers.find((c) => c.id === "S9")?.name).toBe("quiet");
    expect(g.callers[0].requests).toBe(0);
  });
});

describe("topCallersByVolume", () => {
  it("returns the ids of the N highest-request callers", () => {
    const callers = [
      { id: "a", requests: 5 }, { id: "b", requests: 50 }, { id: "c", requests: 10 },
    ] as any;
    expect(topCallersByVolume(callers, 2)).toEqual(new Set(["b", "c"]));
  });
});

describe("sortCallers", () => {
  it("sorts by name asc and requests desc", () => {
    const callers = [
      { id: "1", name: "b", requests: 1 }, { id: "2", name: "a", requests: 9 },
    ] as any;
    expect(sortCallers(callers, "name", "asc").map((c) => c.name)).toEqual(["a", "b"]);
    expect(sortCallers(callers, "requests", "desc").map((c) => c.id)).toEqual(["2", "1"]);
  });
});
