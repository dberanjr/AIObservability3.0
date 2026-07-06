import React, { useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  WarningIcon,
} from "@dynatrace/strato-icons";
import { DataGapNote } from "../../components/DataGapNote";

/**
 * Collapses the standing TTFT/cost data-gap caveat into a one-line, expandable
 * affordance so the top of the Agents page stays calm — the full instrumentation
 * detail is one click away instead of a persistent amber wall above the data.
 * Wraps the shared DataGapNote unchanged (collapsed by default).
 */
export const AgentsCaveatNote = () => {
  const [open, setOpen] = useState(false);
  return (
    <Flex flexDirection="column" gap={6}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          alignSelf: "flex-start",
        }}
      >
        <WarningIcon size={12} style={{ color: "var(--amber)", flex: "0 0 auto" }} />
        <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
          Data caveats: TTFT blank · cost often unattributed · error rate
          includes logical failures
        </Text>
        {open ? (
          <ChevronDownIcon size={14} style={{ color: "var(--text-3)" }} />
        ) : (
          <ChevronRightIcon size={14} style={{ color: "var(--text-3)" }} />
        )}
      </button>
      {open && (
        <DataGapNote
          tone="warn"
          variant="banner"
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
      )}
    </Flex>
  );
};
