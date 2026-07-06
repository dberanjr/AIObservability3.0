import { describe, expect, it } from "vitest";
import { parseBuckets, injectBucketFilter } from "./queries";

describe("parseBuckets", () => {
  it("splits on commas, trims, drops empties, dedupes", () => {
    expect(parseBuckets(" bos_spans , genai_spans ,, bos_spans ")).toEqual([
      "bos_spans",
      "genai_spans",
    ]);
  });
  it("returns [] for empty / whitespace / nullish", () => {
    expect(parseBuckets("")).toEqual([]);
    expect(parseBuckets("   ")).toEqual([]);
    expect(parseBuckets(undefined as unknown as string)).toEqual([]);
  });
});

describe("injectBucketFilter", () => {
  it("appends an OR-of-buckets filter after each fetch spans", () => {
    const out = injectBucketFilter("fetch spans, from:-1h\n| summarize count()", [
      "bos_spans",
      "genai_spans",
    ]);
    expect(out).toBe(
      'fetch spans, from:-1h\n| filter in(dt.system.bucket, {"bos_spans", "genai_spans"})\n| summarize count()',
    );
  });
  it("is a no-op for an empty bucket list", () => {
    const q = "fetch spans, from:-1h\n| summarize count()";
    expect(injectBucketFilter(q, [])).toBe(q);
  });
  it("never touches fetch logs", () => {
    const q = "fetch logs, from:-1h\n| summarize count()";
    expect(injectBucketFilter(q, ["bos_spans"])).toBe(q);
  });
  it("injects into every fetch spans in a join", () => {
    const q = "fetch spans\n| join [\nfetch spans\n], on:{}";
    const out = injectBucketFilter(q, ["bos_spans"]);
    expect(out.match(/dt\.system\.bucket/g)?.length).toBe(2);
  });
  it("escapes double quotes in bucket names", () => {
    expect(injectBucketFilter('fetch spans', ['a"b'])).toContain('"a\\"b"');
  });
});
