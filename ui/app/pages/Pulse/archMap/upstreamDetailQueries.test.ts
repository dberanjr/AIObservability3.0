import { describe, it, expect } from "vitest";
import {
  buildUpstreamEdgePairsQuery,
  buildUpstreamP90SeriesQuery,
  buildServiceComponentsQuery,
} from "./upstreamDetailQueries";
import { buildUpstreamRedQuery } from "./clientUpstreamQueries";

const IDS = ["SERVICE-AAA", "SERVICE-BBB"];
const TF = { from: "now()-24h" } as const;

describe("upstreamDetailQueries", () => {
  it("edge pairs filter target_id via toString and emit source/target names", () => {
    const q = buildUpstreamEdgePairsQuery(IDS);
    expect(q).toContain('smartscapeEdges type:"calls"');
    expect(q).toContain("in(toString(target_id), array(");
    expect(q).toContain("upstream = `s.upstream`");
    expect(q).toContain("aiService = `t.target_name`");
    expect(q).not.toContain("countDistinct"); // pairs, not counts
  });

  it("edge pairs query is empty for no ids", () => {
    expect(buildUpstreamEdgePairsQuery([])).toBe("");
  });

  it("p90 series makes a per-service percentile timeseries", () => {
    const q = buildUpstreamP90SeriesQuery(IDS, TF);
    expect(q).toContain("in(dt.entity.service, array(");
    expect(q).toContain("makeTimeseries");
    expect(q).toContain("p90ns = percentile(duration, 90)");
    expect(q).toContain("by: { svcId = dt.entity.service }");
  });

  it("component rollup collects agents/tools/models per service", () => {
    const q = buildServiceComponentsQuery(IDS, TF);
    expect(q).toContain("in(dt.entity.service, array(");
    expect(q).toContain("agents = collectDistinct(gen_ai.agent.name)");
    expect(q).toContain("tools = collectDistinct(gen_ai.tool.name)");
    expect(q).toContain("models = collectDistinct(gen_ai.request.model)");
    expect(q).toContain("by: { svcId = dt.entity.service }");
  });

  it("RED query now also emits p95", () => {
    expect(buildUpstreamRedQuery(IDS, TF)).toContain("p95ns = percentile(duration, 95)");
  });
});
