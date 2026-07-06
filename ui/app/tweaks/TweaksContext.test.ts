import { describe, expect, it } from "vitest";
import { DEFAULT_TWEAKS } from "./TweaksContext";

describe("DEFAULT_TWEAKS after density/tileStyle removal", () => {
  it("no longer defines density or tileStyle", () => {
    expect("density" in DEFAULT_TWEAKS).toBe(false);
    expect("tileStyle" in DEFAULT_TWEAKS).toBe(false);
  });

  it("still defines the retained visual tweaks", () => {
    expect(DEFAULT_TWEAKS.theme).toBeDefined();
    expect(DEFAULT_TWEAKS.accent).toBeDefined();
    expect(DEFAULT_TWEAKS.pageConfig).toBeDefined();
  });

  it("defaults the span-bucket filter off and empty", () => {
    expect(DEFAULT_TWEAKS.pageConfig.bucketFilterEnabled).toBe(false);
    expect(DEFAULT_TWEAKS.pageConfig.bucketFilterText).toBe("");
  });
});
