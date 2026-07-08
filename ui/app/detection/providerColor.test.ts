import { describe, expect, it } from "vitest";
import { ALL_PROVIDER_IDS, PROVIDER_COLOR } from "./attributes";

describe("PROVIDER_COLOR (UX report Chart-2)", () => {
  it("gives every known provider a distinct colour token", () => {
    const tokens = ALL_PROVIDER_IDS.map((id) => PROVIDER_COLOR[id]);
    expect(new Set(tokens).size, tokens.join(",")).toBe(tokens.length);
  });

  it("no longer collides OpenAI and Google on the same green", () => {
    expect(PROVIDER_COLOR.openai).not.toBe(PROVIDER_COLOR.google);
  });

  it("keeps Google distinct from Bedrock so the two do not read alike", () => {
    expect(PROVIDER_COLOR.google).not.toBe(PROVIDER_COLOR["aws-bedrock"]);
  });
});
