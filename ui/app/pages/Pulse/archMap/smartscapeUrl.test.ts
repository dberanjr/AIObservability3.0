import { describe, it, expect } from "vitest";
import { smartscapeEntityUrl } from "./smartscapeUrl";

describe("smartscapeEntityUrl", () => {
  it("builds a services-app deep link containing the entity id", () => {
    const u = smartscapeEntityUrl("SERVICE-ABC", "https://ualpre.apps.dynatrace.com");
    expect(u).toContain("https://ualpre.apps.dynatrace.com");
    expect(u).toContain("SERVICE-ABC");
  });
  it("returns empty string for a blank id", () => {
    expect(smartscapeEntityUrl("")).toBe("");
  });
});
