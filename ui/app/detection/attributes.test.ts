import { describe, expect, it } from "vitest";
import {
  ALL_PROVIDER_IDS,
  detectFramework,
  normalizeProvider,
  stripModelVersion,
} from "./attributes";

describe("normalizeProvider", () => {
  it("returns unknown when both inputs are nullish", () => {
    expect(normalizeProvider(null, null).id).toBe("unknown");
    expect(normalizeProvider(undefined, undefined).id).toBe("unknown");
    expect(normalizeProvider("", "").id).toBe("unknown");
  });

  it("identifies direct vendors via gen_ai.provider.name", () => {
    expect(normalizeProvider("anthropic", null).id).toBe("anthropic");
    expect(normalizeProvider("openai", null).id).toBe("openai");
    expect(normalizeProvider("google", null).id).toBe("google");
    expect(normalizeProvider("cohere", null).id).toBe("cohere");
    expect(normalizeProvider("mistral", null).id).toBe("mistral");
  });

  it("treats vertex/azure subkinds as their parent vendors", () => {
    expect(normalizeProvider("vertex-ai", null).id).toBe("google");
    expect(normalizeProvider("azure-openai", null).id).toBe("azure");
    expect(normalizeProvider("azure_openai", null).id).toBe("azure");
  });

  it("falls back to model name when system is absent", () => {
    expect(normalizeProvider(null, "claude-sonnet-4-6").id).toBe("anthropic");
    expect(normalizeProvider(null, "gpt-4o").id).toBe("openai");
    expect(normalizeProvider(null, "gemini-2.5-pro").id).toBe("google");
    expect(normalizeProvider(null, "text-embedding-3-large").id).toBe("openai");
  });

  it("unwraps Bedrock vendor prefixes back to their vendor", () => {
    expect(normalizeProvider("bedrock", "anthropic.claude-sonnet-4-6")).toEqual(
      expect.objectContaining({ id: "anthropic", viaBedrock: true }),
    );
    expect(normalizeProvider("bedrock", "cohere.command-r-plus")).toEqual(
      expect.objectContaining({ id: "cohere", viaBedrock: true }),
    );
    expect(normalizeProvider("bedrock", "mistral.mistral-7b")).toEqual(
      expect.objectContaining({ id: "mistral", viaBedrock: true }),
    );
  });

  it("retains aws-bedrock identity for amazon-native models on Bedrock", () => {
    expect(
      normalizeProvider("bedrock", "amazon.titan-text-express"),
    ).toEqual(expect.objectContaining({ id: "aws-bedrock", viaBedrock: true }));
  });

  it("marks Meta-on-Bedrock with a Bedrock-flavored label", () => {
    const result = normalizeProvider("bedrock", "meta.llama3-70b-instruct");
    expect(result.id).toBe("aws-bedrock");
    expect(result.label).toContain("Meta");
    expect(result.viaBedrock).toBe(true);
  });

  it("treats system=aws-bedrock and system=aws_bedrock the same", () => {
    expect(normalizeProvider("aws-bedrock", "amazon.titan").viaBedrock).toBe(true);
    expect(normalizeProvider("aws_bedrock", "amazon.titan").viaBedrock).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(normalizeProvider("ANTHROPIC", null).id).toBe("anthropic");
    expect(normalizeProvider(null, "Claude-Opus-4-5").id).toBe("anthropic");
  });

  it("lists every provider id used by the facets", () => {
    expect(ALL_PROVIDER_IDS).toContain("anthropic");
    expect(ALL_PROVIDER_IDS).toContain("openai");
    expect(ALL_PROVIDER_IDS).toContain("aws-bedrock");
    expect(ALL_PROVIDER_IDS).toContain("google");
  });
});

describe("stripModelVersion", () => {
  it("removes 8-digit date suffix", () => {
    expect(stripModelVersion("claude-sonnet-4-6-20250114")).toBe("claude-sonnet-4-6");
  });

  it("removes -v<n> trailing tag after date", () => {
    expect(stripModelVersion("claude-haiku-4-5-20251001-v2")).toBe("claude-haiku-4-5");
  });

  it("leaves names without a version tag alone", () => {
    expect(stripModelVersion("gpt-4o")).toBe("gpt-4o");
    expect(stripModelVersion("gemini-2.5-pro")).toBe("gemini-2.5-pro");
  });
});

describe("detectFramework", () => {
  it("returns Unknown when both inputs are absent", () => {
    expect(detectFramework(null, null)).toBe("Unknown");
    expect(detectFramework(undefined, undefined)).toBe("Unknown");
  });

  it("matches LangGraph by name pattern", () => {
    expect(detectFramework("langgraph.invoke", null)).toBe("LangGraph");
    expect(detectFramework(null, "LangGraph")).toBe("LangGraph");
  });

  it("recognizes AgentExecutor with various separators", () => {
    expect(detectFramework("agent_executor", null)).toBe("AgentExecutor");
    expect(detectFramework("AgentExecutor.run", null)).toBe("AgentExecutor");
    expect(detectFramework("agent-executor", null)).toBe("AgentExecutor");
  });

  it("recognizes RunnableSequence", () => {
    expect(detectFramework("RunnableSequence", null)).toBe("RunnableSequence");
    expect(detectFramework("runnable_sequence.step", null)).toBe("RunnableSequence");
  });

  it("recognizes retrieval_chain", () => {
    expect(detectFramework("retrieval_chain", null)).toBe("retrieval_chain");
    expect(detectFramework(null, "retrieval-chain")).toBe("retrieval_chain");
  });

  it("falls back to Custom when a name is present but doesn't match", () => {
    expect(detectFramework("MyCustomSpan", null)).toBe("Custom");
  });
});
