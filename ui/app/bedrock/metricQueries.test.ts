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
});
describe("buildBedrockTpmQuery", () => {
  it("queries EstimatedTPMQuotaUsage", () => {
    expect(buildBedrockTpmQuery(tf)).toContain("`cloud.aws.bedrock.EstimatedTPMQuotaUsage.By.ModelId`");
  });
});
