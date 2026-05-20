/**
 * Classify a span (or per-name aggregate) as an "agent" vs an orchestration node.
 *
 * Orchestration nodes are LangGraph / RunnableChain / template framework
 * internals that show up as spans with agent-like names but do no LLM or tool
 * work themselves. The Agents table hides them by default and surfaces them in
 * the collapsible "Orchestration & runtime nodes" section per Session 7 handoff.
 *
 * Two-pass rule:
 *   1. Name-list match — known internals (RunnableSequence, PromptTemplate, …).
 *   2. Behavioral heuristic — no LLM child span AND avg duration < 200 ms.
 *
 * Either match → orchestration. Both miss → substantive agent.
 */

/** Known LangGraph / Runnable / template names that are always orchestration. */
export const ORCHESTRATION_NAMES = new Set([
  "RunnableSequence",
  "RunnableLambda",
  "RunnableParallel",
  "RunnableBranch",
  "RunnableMap",
  "RunnablePassthrough",
  "RunnableAssign",
  "StrOutputParser",
  "PydanticOutputParser",
  "JsonOutputParser",
  "PromptTemplate",
  "ChatPromptTemplate",
  "FewShotPromptTemplate",
  "MessagesPlaceholder",
  "continue_to_summarize",
  "should_continue",
  "routing_function",
  "tools_condition",
]);

/** Per-agent aggregate shape used by the classifier. */
export interface AgentClassifierInput {
  agent: string;
  /** Average duration in ms (already converted from ns). */
  avgMs: number;
  /** Whether any child span of this agent has gen_ai.provider.name set (LLM call). */
  hasLlmChild?: boolean;
  /** Whether any child span has gen_ai.tool.name set (tool call). */
  hasToolChild?: boolean;
}

export const ORCHESTRATION_AVG_MS_THRESHOLD = 200;

export const isOrchestrationNode = (input: AgentClassifierInput): boolean => {
  if (ORCHESTRATION_NAMES.has(input.agent)) return true;
  const noLlmOrTool = !input.hasLlmChild && !input.hasToolChild;
  return noLlmOrTool && input.avgMs < ORCHESTRATION_AVG_MS_THRESHOLD;
};

/** Convenience: partition a list into substantive vs orchestration. */
export const partitionAgents = <T extends AgentClassifierInput>(
  agents: T[],
): { substantive: T[]; orchestration: T[] } => {
  const substantive: T[] = [];
  const orchestration: T[] = [];
  for (const a of agents) {
    if (isOrchestrationNode(a)) orchestration.push(a);
    else substantive.push(a);
  }
  return { substantive, orchestration };
};
