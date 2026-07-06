import { describe, expect, it } from "vitest";
import { buildSectionQuery } from "./queries";
import { SECTIONS } from "./catalog";

const tf = { from: "-24h", to: "now()" };

describe("buildSectionQuery bucket scoping", () => {
  it("appends a bucket filter after fetch when a bucket is given", () => {
    const q = buildSectionQuery(SECTIONS[0], tf, "bos_spans");
    expect(q).toContain('| filter dt.system.bucket == "bos_spans"');
    // the bucket filter comes before the section population filter
    expect(q.indexOf("dt.system.bucket")).toBeLessThan(
      q.indexOf(SECTIONS[0].population),
    );
  });
  it("adds no bucket filter when none is given", () => {
    expect(buildSectionQuery(SECTIONS[0], tf)).not.toContain("dt.system.bucket");
  });
  it("escapes quotes in the bucket name", () => {
    const q = buildSectionQuery(SECTIONS[0], tf, 'a"b');
    expect(q).toContain('dt.system.bucket == "a\\"b"');
  });
});
