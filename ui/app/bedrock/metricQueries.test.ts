import { describe, expect, it } from "vitest";
import { buildBedrockPerfByModelQuery, buildBedrockTpmQuery } from "./metricQueries";

const tf = { from: "now()-24h", to: "now()" };

describe("buildBedrockPerfByModelQuery", () => {
  it("timeseries over the bedrock metric keys, by ModelId", () => {
    const q = buildBedrockPerfByModelQuery(tf);
    expect(q).toContain("timeseries");
    expect(q).toContain("`cloud.aws.bedrock.InvocationLatency.By.ModelId`");
    expect(q).toContain("`cloud.aws.bedrock.TimeToFirstToken.By.ModelId`");
    expect(q).toContain("by: { ModelId }");
    expect(q).toContain("from: now()-24h");
  });

  it("uses a fine chart-granularity interval (pickChartIntervalSec) so per-model sparklines are detailed", () => {
    // now()-24h → pickChartIntervalSec targets ~240 buckets → 15m (900s).
    expect(buildBedrockPerfByModelQuery(tf)).toContain("interval: 900s");
  });
});
describe("buildBedrockTpmQuery", () => {
  it("queries EstimatedTPMQuotaUsage", () => {
    expect(buildBedrockTpmQuery(tf)).toContain("`cloud.aws.bedrock.EstimatedTPMQuotaUsage.By.ModelId`");
  });

  it("uses a fine chart-granularity interval (pickChartIntervalSec) so the TPM sparkline is detailed", () => {
    expect(buildBedrockTpmQuery(tf)).toContain("interval: 900s");
  });
});

describe("optional timeframe.to handling", () => {
  it("buildBedrockPerfByModelQuery defaults to: now() when to is undefined", () => {
    const noTo = { from: "now()-1h" };
    const q = buildBedrockPerfByModelQuery(noTo);
    expect(q).toContain("to: now()");
    expect(q).not.toContain("to: undefined");
  });
  it("buildBedrockTpmQuery defaults to: now() when to is undefined", () => {
    const noTo = { from: "now()-1h" };
    const q = buildBedrockTpmQuery(noTo);
    expect(q).toContain("to: now()");
    expect(q).not.toContain("to: undefined");
  });
});
