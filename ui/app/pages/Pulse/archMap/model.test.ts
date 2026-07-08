import { describe, expect, it } from "vitest";
import { resolveCell, type NodeView } from "./model";

const base = (over: Partial<NodeView> = {}): NodeView => ({
  status: "healthy",
  state: "live",
  headline: "1,234",
  sub: "LLM calls",
  badges: [{ text: "p90 1s", tone: "neutral" }],
  findings: 0,
  reason: "",
  cells: {},
  ...over,
});

describe("resolveCell", () => {
  it("returns the base cell when no lens is active", () => {
    const c = resolveCell(base(), null);
    expect(c.headline).toBe("1,234");
    expect(c.status).toBe("healthy");
    expect(c.badges).toHaveLength(1);
  });

  it("returns the lens cell when the tier carries a numeric reading for it", () => {
    const v = base({
      cells: { latency: { status: "warning", headline: "3s", sub: "p90", badges: [] } },
    });
    const c = resolveCell(v, "latency");
    expect(c.headline).toBe("3s");
    expect(c.status).toBe("warning");
  });

  it("keeps the base headline (dimmed) with the lens caption when the lens cell has no number", () => {
    const v = base({
      cells: { cost: { status: "muted", sub: "scratchpad re-sent as input tokens", badges: [] } },
    });
    const c = resolveCell(v, "cost");
    expect(c.headline).toBe("1,234"); // base headline preserved, not dropped
    expect(c.sub).toBe("scratchpad re-sent as input tokens"); // lens caption kept
    expect(c.status).toBe("muted"); // dimmed
  });

  it("keeps the base headline with the base sub when the lens is absent entirely", () => {
    const c = resolveCell(base(), "errors");
    expect(c.headline).toBe("1,234");
    expect(c.sub).toBe("LLM calls");
    expect(c.status).toBe("muted");
  });

  it("leaves the headline undefined for tiers that never had one (client/gateway)", () => {
    const v = base({ headline: undefined, sub: "no native OTel", cells: {} });
    const c = resolveCell(v, "cost");
    expect(c.headline).toBeUndefined();
    expect(c.sub).toBe("no native OTel");
  });
});
