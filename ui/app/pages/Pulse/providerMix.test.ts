import { describe, expect, it } from "vitest";
import { extrapolatedSum, type ProviderRecord } from "./providerMix";

// Grail returns count()/sum() longs as STRINGS. These records mirror that.
const records: ProviderRecord[] = [
  { provider: "aws_bedrock", requests: "116731" as unknown as number, via_bedrock_count: "116731" as unknown as number },
  { provider: "openai", requests: "6626" as unknown as number, via_bedrock_count: "0" as unknown as number },
  { provider: "Anthropic", requests: "70" as unknown as number, via_bedrock_count: "0" as unknown as number },
  { provider: "Google", requests: "16" as unknown as number, via_bedrock_count: "0" as unknown as number },
];

describe("extrapolatedSum", () => {
  it("numerically ADDS string-typed counts (never concatenates)", () => {
    // The bug: `acc + "116731"` string-concatenates into ~1.1e13. The fix sums.
    expect(extrapolatedSum(records, (r) => r.requests, 1)).toBe(123443);
  });

  it("extrapolates by the sampling ratio", () => {
    expect(extrapolatedSum(records, (r) => r.requests, 100)).toBe(12344300);
  });

  it("treats missing / non-numeric values as 0", () => {
    const withGaps: ProviderRecord[] = [
      { provider: "a", requests: "50" as unknown as number },
      { provider: "b" }, // no requests
      { provider: "c", requests: undefined },
    ];
    expect(extrapolatedSum(withGaps, (r) => r.requests, 1)).toBe(50);
  });

  it("sums an arbitrary picked field (via_bedrock_count)", () => {
    expect(extrapolatedSum(records, (r) => r.via_bedrock_count, 1)).toBe(116731);
  });
});
