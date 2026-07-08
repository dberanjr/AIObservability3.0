import { describe, expect, it } from "vitest";
import { agentsViewSummary } from "./viewSummary";

describe("agentsViewSummary", () => {
  it("shows a plain count for the All view", () => {
    expect(agentsViewSummary("all", 12)).toBe("12 agents");
    expect(agentsViewSummary("all", 1)).toBe("1 agent");
  });

  it("names the slow-view threshold so the count isn't read as a raw total", () => {
    expect(agentsViewSummary("slow", 5)).toBe("Slow · P90 > 2s · 5 agents");
  });

  it("marks the ranked views as top-N slices, not match totals", () => {
    expect(agentsViewSummary("expensive", 50)).toBe("Top 50 by cost");
    expect(agentsViewSummary("used", 50)).toBe("Top 50 by invocations");
    expect(agentsViewSummary("expensive", 12)).toBe("Top 12 by cost");
  });
});
