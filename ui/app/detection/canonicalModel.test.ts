import { describe, expect, it } from "vitest";
import { canonicalizeModel } from "./attributes";

describe("canonicalizeModel", () => {
  it("merges Claude naming-convention variants into one key", () => {
    const a = canonicalizeModel("global.anthropic.claude-sonnet-4-6");
    const b = canonicalizeModel("Claude-Sonnet-4.6");
    expect(a.key).toBe(b.key);
    expect(a.label).toBe("Claude Sonnet 4.6");
  });

  it("strips date stamps and bedrock revision tags", () => {
    const a = canonicalizeModel(
      "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    );
    const b = canonicalizeModel("Claude-Sonnet-4.5");
    expect(a.key).toBe(b.key);
    expect(a.label).toBe("Claude Sonnet 4.5");
  });

  it("keeps distinct versions distinct", () => {
    expect(canonicalizeModel("us.anthropic.claude-opus-4-7").key).not.toBe(
      canonicalizeModel("us.anthropic.claude-opus-4-8").key,
    );
    expect(canonicalizeModel("Claude-Sonnet-4.5").key).not.toBe(
      canonicalizeModel("Claude-Sonnet-4.6").key,
    );
  });

  it("is order-independent for tier and version", () => {
    expect(canonicalizeModel("Claude-4.5-Opus").key).toBe(
      canonicalizeModel("global.anthropic.claude-opus-4-5-20251101-v1:0").key,
    );
  });

  it("handles lone trailing version digits", () => {
    expect(canonicalizeModel("us.anthropic.claude-sonnet-4-20250514-v1:0").label).toBe(
      "Claude Sonnet 4",
    );
  });

  it("handles haiku 3.5", () => {
    expect(
      canonicalizeModel("us.anthropic.claude-3-5-haiku-20241022-v1:0").label,
    ).toBe("Claude Haiku 3.5");
  });

  it("merges GPT casing variants and prettifies version", () => {
    const a = canonicalizeModel("gpt-4.1");
    const b = canonicalizeModel("GPT-4.1");
    expect(a.key).toBe(b.key);
    expect(a.label).toBe("GPT 4.1");
  });

  it("prettifies non-claude families without over-merging", () => {
    expect(canonicalizeModel("Gemini-3.1-Pro-Preview").label).toBe(
      "Gemini 3.1 Pro Preview",
    );
    expect(canonicalizeModel("Gemini-3-Flash-Preview").key).not.toBe(
      canonicalizeModel("Gemini-3.1-Pro-Preview").key,
    );
    expect(canonicalizeModel("text-embedding-3-large").label).toBe(
      "Text Embedding 3 Large",
    );
  });

  it("returns Unknown for empty input", () => {
    expect(canonicalizeModel("").key).toBe("unknown");
    expect(canonicalizeModel(null).label).toBe("Unknown");
  });
});
