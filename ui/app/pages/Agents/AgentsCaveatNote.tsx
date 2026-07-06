import React from "react";
import { CollapsibleDataGapNote } from "../../components/CollapsibleDataGapNote";

/**
 * Collapses the standing TTFT/cost data-gap caveat into a one-line, expandable
 * affordance so the top of the Agents page stays calm — the full instrumentation
 * detail is one click away instead of a persistent amber wall above the data.
 * Now a thin wrapper over the shared CollapsibleDataGapNote (IA — Information-8);
 * the copy is unchanged.
 */
export const AgentsCaveatNote = () => (
  <CollapsibleDataGapNote
    tone="warn"
    summary="Data caveats: TTFT blank · cost often unattributed · error rate includes logical failures"
    message="TTFT is blank and per-agent cost is often unattributed (—) in this scope: no time-to-first-token attribute is emitted, and LLM calls run on a separate proxy trace so tokens can't be joined to the agent. Error rate now also includes logical failures (refusals / content-filter)."
    attributes={[
      "gen_ai.response.ttft",
      "gen_ai.usage.cost",
      "gen_ai.agent.name (on LLM spans)",
    ]}
    bestPractice="Propagate W3C trace context across the LLM proxy so agent and LLM spans share a trace (enables cost attribution), and emit a TTFT attribute on streamed responses. See INSTRUMENTATION-REQUIREMENTS.md P0.1 and P1.5."
    href="https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/"
    hrefLabel="OTel GenAI spans"
  />
);
