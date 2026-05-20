import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtCount } from "../../data/format";
import type { UseUpstreamServicesResult } from "./useUpstreamServices";

export interface UpstreamServicesTableProps {
  result: UseUpstreamServicesResult;
}

export const UpstreamServicesTable = ({ result }: UpstreamServicesTableProps) => (
  <Surface elevation="raised" padding={0}>
    <Flex flexDirection="column" gap={0}>
      <Flex
        flexDirection="column"
        gap={2}
        style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}
      >
        <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
          Upstream services
        </Heading>
        <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
          Services that called these agents — causal chain origin
        </Text>
      </Flex>

      <Flex
        alignItems="center"
        style={{
          padding: "6px 16px",
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--text-3)",
        }}
      >
        <span style={{ flex: 1 }}>Upstream</span>
        <span style={{ width: 80, textAlign: "right" }}>Calls</span>
        <span style={{ width: 80, textAlign: "right" }}>Agents</span>
      </Flex>

      {result.isLoading && result.rows.length === 0 ? (
        <Flex flexDirection="column" gap={4} style={{ padding: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} style={{ height: 28 }} />
          ))}
        </Flex>
      ) : result.rows.length === 0 ? (
        <Flex style={{ padding: "24px 16px" }}>
          <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            No upstream services attributed in the current scope.
          </Text>
        </Flex>
      ) : (
        result.rows.map((r) => (
          <Flex
            key={r.upstream}
            alignItems="center"
            style={{
              padding: "6px 16px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <Text
              style={{
                flex: 1,
                fontFamily: "var(--mono, monospace)",
                fontSize: 12.5,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {r.upstream}
            </Text>
            <Text
              style={{
                width: 80,
                textAlign: "right",
                fontFamily: "var(--mono, monospace)",
                fontSize: 12.5,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtCount(r.calls)}
            </Text>
            <Text
              style={{
                width: 80,
                textAlign: "right",
                fontFamily: "var(--mono, monospace)",
                fontSize: 12.5,
                fontVariantNumeric: "tabular-nums",
                color: "var(--text-2)",
              }}
            >
              {fmtCount(r.agents)}
            </Text>
          </Flex>
        ))
      )}

      <Flex
        style={{
          padding: "10px 16px",
          borderTop: "1px solid var(--border)",
          background: "var(--surface-2)",
        }}
      >
        <Text
          style={{
            fontSize: 11,
            color: "var(--text-3)",
            lineHeight: 1.5,
          }}
        >
          Upstream attribution reads <code>parent.service.name</code> from each
          agent span. Agents called over messaging or async fan-out won't appear
          until span links graduate from the topology session.
        </Text>
      </Flex>
    </Flex>
  </Surface>
);
