import React, { useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  WarningIcon,
} from "@dynatrace/strato-icons";
import { fmtCount, fmtMs } from "../../data/format";
import type { AgentRow } from "./useAgents";

export interface OrchestrationSectionProps {
  rows: AgentRow[];
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
              These are LangGraph / RunnableChain framework internals. Latency
              includes orchestration overhead. Excluded from headline counts so
              SLA scoring isn't diluted by no-op router nodes.
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
            <span style={{ width: 140 }}>Service</span>
            <span style={{ width: 80, textAlign: "right" }}>Invocations</span>
            <span style={{ width: 80, textAlign: "right" }}>Avg</span>
            <span style={{ width: 80, textAlign: "right" }}>P90</span>
          </Flex>
          {rows.map((r) => (
            <Flex
              key={`${r.serviceId}-${r.agent}`}
              alignItems="center"
              style={{
                padding: "6px 10px",
                borderTop: "1px solid var(--border)",
              }}
            >
              <Text
                style={{
                  flex: 1,
                  fontFamily: "var(--mono, monospace)",
                  fontSize: 12,
                }}
              >
                {r.agent}
              </Text>
              <Text
                style={{
                  width: 140,
                  fontFamily: "var(--mono, monospace)",
                  fontSize: 12,
                  color: "var(--text-2)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {r.service}
              </Text>
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
