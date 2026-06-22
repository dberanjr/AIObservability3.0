import { describe, it, expect } from "vitest";
import { SECTION_IDS, tileAction, topServiceName } from "./tileActions";
import type { ExplorerSummary } from "./useExplorerSummary";

const base: ExplorerSummary = {
  aiServiceCount: 3,
  llmRequests: 100,
  tokens: 5000,
  activeModels: 4,
  concentrationPct: 62,
  errors: 5,
  logicalErrors: 2,
  topServiceShare: { service: "checkout-ai", pct: 62 },
};

describe("topServiceName", () => {
  it("returns the top service from topServiceShare", () => {
    expect(topServiceName(base)).toBe("checkout-ai");
  });
  it("returns null when there is no top service", () => {
    expect(topServiceName({ ...base, topServiceShare: null })).toBeNull();
  });
});

describe("tileAction", () => {
  it("errors tile filters span.status_code = error", () => {
    expect(tileAction("errors", base)).toEqual({
      kind: "filter",
      attribute: "span.status_code",
      values: ["error"],
      aria: expect.any(String),
    });
  });

  it("concentration tile filters service.name to the top service", () => {
    const a = tileAction("concentration", base);
    expect(a.kind).toBe("filter");
    if (a.kind === "filter") {
      expect(a.attribute).toBe("service.name");
      expect(a.values).toEqual(["checkout-ai"]);
    }
  });

  it("concentration tile is inert with no top service", () => {
    expect(tileAction("concentration", { ...base, topServiceShare: null })).toEqual({
      kind: "none",
    });
  });

  it("logical errors tile scrolls to the services table (no clean single attr)", () => {
    expect(tileAction("logicalErrors", base)).toMatchObject({
      kind: "scroll",
      section: SECTION_IDS.servicesTable,
    });
  });

  it("active models tile scrolls to the heatmap", () => {
    expect(tileAction("activeModels", base)).toMatchObject({
      kind: "scroll",
      section: SECTION_IDS.heatmap,
    });
  });

  it("count tiles (services/requests/tokens) scroll to the services table", () => {
    for (const id of ["aiServices", "llmRequests", "tokens"] as const) {
      expect(tileAction(id, base)).toMatchObject({
        kind: "scroll",
        section: SECTION_IDS.servicesTable,
      });
    }
  });
});
