import { describe, expect, it } from "vitest";
import { buildBucketDetectionQuery } from "./bucketDetection";

describe("buildBucketDetectionQuery", () => {
  it("filters by the matcher then summarizes by bucket", () => {
    const q = buildBucketDetectionQuery({ from: "-6h", to: "now()" });
    expect(q).toContain("fetch spans");
    expect(q).toContain("isNotNull(`gen_ai.request.model`)");
    expect(q).toContain("summarize spans = count(), by: {dt.system.bucket}");
    expect(q).toContain("sort spans desc");
  });
  it("interpolates the timeframe with a default to", () => {
    const q = buildBucketDetectionQuery({ from: "-24h" });
    expect(q).toContain("from: -24h");
    expect(q).toContain("to: now()");
  });
});
