import React, { useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  WarningIcon,
} from "@dynatrace/strato-icons";
import { fmtCount, fmtMs } from "../../data/format";
import { FilterTrigger } from "../../components/FilterTrigger";
import type { NodeRow } from "./useOrchestrationNodes";

export interface OrchestrationSectionProps {
  rows: NodeRow[];
}

export const OrchestrationSection = ({ rows }: OrchestrationSectionProps) => {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;

  return (
    <Surface elevation="raised" padding={0}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          all: "unset",
          cursor: "pointer",
          width: "100%",
        }}
      >
        <Flex
          alignItems="center"
          gap={8}
          style={{ padding: "10px 16px" }}
        >
          {open ? (
            <ChevronDownIcon size={14} style={{ color: "var(--text-3)" }} />
          ) : (
            <ChevronRightIcon size={14} style={{ color: "var(--text-3)" }} />
          )}
          <Text
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            Orchestration &amp; runtime nodes ({rows.length})
          </Text>
          <Flex flexGrow={1} />
          {!open && (
            <Flex alignItems="center" gap={6} style={{ color: "var(--amber)" }}>
              <WarningIcon size={14} />
              <Text style={{ fontSize: 11.5, color: "var(--amber)" }}>
                LangGraph / RunnableChain framework internals
              </Text>
            </Flex>
          )}
        </Flex>
      </button>

      {open && (
        <Flex
          flexDirection="column"
          gap={6}
          style={{
            padding: "10px 16px 16px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-2)",
          }}
        >
          <Flex
            alignItems="flex-start"
            gap={8}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              background:
                "color-mix(in oklab, var(--amber) 10%, var(--surface))",
              border:
                "1px solid color-mix(in oklab, var(--amber) 40%, transparent)",
            }}
          >
            <WarningIcon
              size={14}
              style={{ color: "var(--amber)", flex: "0 0 auto", marginTop: 2 }}
            />
            <Text style={{ fontSize: 12, color: "var(--text)" }}>
              Node-level runtime breakdown — each row is an individual runtime
              span (<code>span.name</code>) inside an agent execution (tool
              calls, routers, retrieval, sub-steps), not the agent itself.
              Latency is per-node. Excluded from headline agent counts.
            </Text>
          </Flex>
          <Flex
            style={{
              padding: "6px 10px",
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--text-3)",
            }}
          >
            <span style={{ flex: 1 }}>Node</span>
            <span style={{ width: 160 }}>Agent</span>
            <span style={{ width: 80, textAlign: "right" }}>Invocations</span>
            <span style={{ width: 80, textAlign: "right" }}>Avg</span>
            <span style={{ width: 80, textAlign: "right" }}>P90</span>
          </Flex>
          {rows.map((r) => (
            <Flex
              key={`${r.agent}-${r.node}`}
              alignItems="center"
              style={{
                padding: "6px 10px",
                borderTop: "1px solid var(--border)",
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <FilterTrigger attribute="span.name" value={r.node} label="node">
                  <Text
                    style={{
                      fontFamily: "var(--mono, monospace)",
                      fontSize: 12,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      display: "block",
                    }}
                  >
                    {r.node}
                  </Text>
                </FilterTrigger>
              </span>
              <span style={{ width: 160 }}>
                <FilterTrigger
                  attribute="gen_ai.agent.name"
                  value={r.agent}
                  label="agent"
                >
                  <Text
                    style={{
                      fontFamily: "var(--mono, monospace)",
                      fontSize: 12,
                      color: "var(--text-2)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      display: "block",
                    }}
                    title={r.service}
                  >
                    {r.agent}
                  </Text>
                </FilterTrigger>
              </span>
              <Text
                style={{
                  width: 80,
                  textAlign: "right",
                  fontFamily: "var(--mono, monospace)",
                  fontSize: 12,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtCount(r.invocations)}
              </Text>
              <Text
                style={{
                  width: 80,
                  textAlign: "right",
                  fontFamily: "var(--mono, monospace)",
                  fontSize: 12,
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--text-2)",
                }}
              >
                {fmtMs(r.avgMs)}
              </Text>
              <Text
                style={{
                  width: 80,
                  textAlign: "right",
                  fontFamily: "var(--mono, monospace)",
                  fontSize: 12,
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--text-2)",
                }}
              >
                {fmtMs(r.p90Ms)}
              </Text>
            </Flex>
          ))}
        </Flex>
      )}
    </Surface>
  );
};
