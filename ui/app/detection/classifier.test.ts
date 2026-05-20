import { describe, expect, it } from "vitest";
import {
  ORCHESTRATION_AVG_MS_THRESHOLD,
  ORCHESTRATION_NAMES,
  isOrchestrationNode,
  partitionAgents,
} from "./classifier";

describe("isOrchestrationNode", () => {
  it("classifies known framework names as orchestration even when fast and child-bearing", () => {
    expect(
      isOrchestrationNode({
        agent: "RunnableSequence",
        avgMs: 1500,
        hasLlmChild: true,
        hasToolChild: true,
      }),
    ).toBe(true);
    expect(
      isOrchestrationNode({
        agent: "PromptTemplate",
        avgMs: 50,
      }),
    ).toBe(true);
  });

  it("treats short-duration no-child spans as orchestration", () => {
    expect(
      isOrchestrationNode({
        agent: "my_router",
        avgMs: ORCHESTRATION_AVG_MS_THRESHOLD - 1,
        hasLlmChild: false,
        hasToolChild: false,
      }),
    ).toBe(true);
  });

  it("does NOT classify long-running no-child spans as orchestration", () => {
    expect(
      isOrchestrationNode({
        agent: "slow_internal",
        avgMs: ORCHESTRATION_AVG_MS_THRESHOLD,
        hasLlmChild: false,
        hasToolChild: false,
      }),
    ).toBe(false);
  });

  it("does NOT classify spans with LLM children as orchestration (unless named)", () => {
    expect(
      isOrchestrationNode({
        agent: "qna_agent",
        avgMs: 50,
        hasLlmChild: true,
      }),
    ).toBe(false);
  });

  it("does NOT classify spans with tool children as orchestration (unless named)", () => {
    expect(
      isOrchestrationNode({
        agent: "retrieval_executor",
        avgMs: 50,
        hasLlmChild: false,
        hasToolChild: true,
      }),
    ).toBe(false);
  });

  it("recognizes the LangGraph routing helpers from the canonical list", () => {
    for (const name of [
      "RunnableSequence",
      "RunnableLambda",
      "StrOutputParser",
      "PydanticOutputParser",
      "PromptTemplate",
      "ChatPromptTemplate",
      "continue_to_summarize",
      "should_continue",
      "routing_function",
    ]) {
      expect(ORCHESTRATION_NAMES.has(name)).toBe(true);
      expect(isOrchestrationNode({ agent: name, avgMs: 9999 })).toBe(true);
    }
  });
});

describe("partitionAgents", () => {
  it("splits into substantive and orchestration arrays without losing items", () => {
    const input = [
      { agent: "qna_agent", avgMs: 1200, hasLlmChild: true },
      { agent: "RunnableSequence", avgMs: 50 },
      { agent: "router", avgMs: 30 },
      { agent: "tool_picker", avgMs: 800, hasToolChild: true },
    ];
    const { substantive, orchestration } = partitionAgents(input);
    expect(substantive.map((a) => a.agent).sort()).toEqual([
      "qna_agent",
      "tool_picker",
    ]);
    expect(orchestration.map((a) => a.agent).sort()).toEqual([
      "RunnableSequence",
      "router",
    ]);
    expect(substantive.length + orchestration.length).toBe(input.length);
  });

  it("handles empty input", () => {
    const { substantive, orchestration } = partitionAgents([]);
    expect(substantive).toEqual([]);
    expect(orchestration).toEqual([]);
  });
});
