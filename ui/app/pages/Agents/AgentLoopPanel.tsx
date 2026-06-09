import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { RefreshIcon } from "@dynatrace/strato-icons";
import { InfoTooltip } from "../../components/InfoTooltip";
import { DataGapNote } from "../../components/DataGapNote";
import { FilterTrigger } from "../../components/FilterTrigger";
import { fmtCount } from "../../data/format";
import { useAgentLoops, LOOP_REPEAT_RATIO, LOOP_MAX_STEP } from "./useAgentLoops";

/** Severity color from loop rate. */
const rateColor = (pct: number): string =>
  pct >= 50 ? "var(--red)" : pct >= 15 ? "var(--amber)" : "var(--green-2)";

export const AgentLoopPanel = () => {
  const { rows, loopingCount, isLoading, isEmpty } = useAgentLoops();

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="center" gap={6}>
          <RefreshIcon size={16} style={{ color: "var(--blue)" }} />
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Agent loop detection
          </Heading>
          <InfoTooltip
            text={`Per LangGraph run (trace + agent) we compare node executions to distinct nodes (revisits = a loop) and the max step reached. A run is flagged looping when a node is revisited ${LOOP_REPEAT_RATIO}x+ on average or the run reaches ${LOOP_MAX_STEP}+ steps. Loop rate is the share of an agent's runs that are flagged.`}
          />
          {!isLoading && (
            <Text style={{ fontSize: 11, color: "var(--text-3)", marginLeft: "auto" }}>
              {loopingCount} {loopingCount === 1 ? "agent" : "agents"} with loops
            </Text>
          )}
        </Flex>

        {isLoading ? (
          <Flex flexDirection="column" gap={8}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 28 }} />
            ))}
          </Flex>
        ) : isEmpty ? (
          <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
            No LangGraph execution spans in this scope — loop detection needs{" "}
            <code>traceloop.association.properties.langgraph_node</code>.
          </Text>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <thead>
                <tr>
                  {["Agent", "Loop rate", "Looping / runs", "Max revisits", "Max steps"].map(
                    (h, i) => (
                      <th
                        key={h}
                        style={{
                          padding: "6px 8px",
                          textAlign: i === 0 ? "left" : "right",
                          fontWeight: 600,
                          color: "var(--text-3)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.agent} style={{ borderTop: "1px solid var(--border)" }}>
                    <td
                      style={{
                        padding: "7px 8px",
                        fontFamily: "var(--font-mono, ui-monospace, monospace)",
                        maxWidth: 260,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={r.agent}
                    >
                      {r.unattributed ? (
                        <span style={{ color: "var(--text-4)", fontStyle: "italic" }}>
                          {r.agent}
                        </span>
                      ) : (
                        <FilterTrigger attribute="gen_ai.agent.name" value={r.agent} label="agent">
                          {r.agent}
                        </FilterTrigger>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "7px 8px",
                        textAlign: "right",
                        fontWeight: 600,
                        color: rateColor(r.loopRatePct),
                      }}
                    >
                      {r.loopRatePct.toFixed(1)}%
                    </td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-2)" }}>
                      {fmtCount(r.loopingRuns)} / {fmtCount(r.runs)}
                    </td>
                    <td
                      style={{
                        padding: "7px 8px",
                        textAlign: "right",
                        color: r.maxRepeat >= LOOP_REPEAT_RATIO ? "var(--amber)" : "var(--text-2)",
                      }}
                    >
                      {r.maxRepeat.toFixed(1)}×
                    </td>
                    <td
                      style={{
                        padding: "7px 8px",
                        textAlign: "right",
                        color: r.maxSteps >= LOOP_MAX_STEP ? "var(--amber)" : "var(--text-2)",
                      }}
                    >
                      {fmtCount(r.maxSteps)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DataGapNote
          message="Loop detection is heuristic (revisit ratio + step depth). The 'unattributed' row is LangGraph activity on spans with no agent name."
          attributes={["gen_ai.agent.iteration", "gen_ai.agent.max_iterations", "traceloop.association.properties.thread_id"]}
          bestPractice="Emit agent iteration / max-iteration counters and a stable thread_id, and propagate agent identity to LangGraph spans, for exact non-termination detection instead of a revisit heuristic. See INSTRUMENTATION-REQUIREMENTS.md P2.4 / P0.1."
          href="https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/"
          hrefLabel="OTel GenAI spans"
        />
      </Flex>
    </Surface>
  );
};
