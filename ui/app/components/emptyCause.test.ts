import { describe, expect, it } from "vitest";
import { emptyCause } from "./emptyCause";

describe("emptyCause", () => {
  it("defaults to no-activity when nothing is flagged", () => {
    expect(emptyCause()).toBe("no-activity");
    expect(emptyCause({})).toBe("no-activity");
  });

  it("maps each single signal to its cause", () => {
    expect(emptyCause({ error: new Error("boom") })).toBe("error");
    expect(emptyCause({ capabilityAbsent: true })).toBe("no-instrumentation");
    expect(emptyCause({ scopeUnresolved: true })).toBe("no-scope");
    expect(emptyCause({ limitHit: true })).toBe("truncated");
  });

  it("treats any truthy error value as an error (not just Error instances)", () => {
    expect(emptyCause({ error: "network failed" })).toBe("error");
    expect(emptyCause({ error: { message: "x" } })).toBe("error");
  });

  it("ignores falsy error values", () => {
    expect(emptyCause({ error: null })).toBe("no-activity");
    expect(emptyCause({ error: undefined })).toBe("no-activity");
    expect(emptyCause({ error: false })).toBe("no-activity");
    expect(emptyCause({ error: "" })).toBe("no-activity");
  });

  it("honours precedence: error > no-instrumentation > no-scope > truncated > no-activity", () => {
    // error wins over everything
    expect(
      emptyCause({
        error: new Error("x"),
        capabilityAbsent: true,
        scopeUnresolved: true,
        limitHit: true,
      }),
    ).toBe("error");
    // no-instrumentation wins over scope + truncated
    expect(
      emptyCause({
        capabilityAbsent: true,
        scopeUnresolved: true,
        limitHit: true,
      }),
    ).toBe("no-instrumentation");
    // no-scope wins over truncated
    expect(emptyCause({ scopeUnresolved: true, limitHit: true })).toBe(
      "no-scope",
    );
    // truncated wins over the no-activity default
    expect(emptyCause({ limitHit: true })).toBe("truncated");
  });
});
