import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import {
  ChevronRightIcon,
  CriticalIcon,
  WarningIcon,
  CheckmarkIcon,
} from "@dynatrace/strato-icons";
import type { Anomaly } from "./anomalies/types";
import type { FindingSeverity } from "../../components/drawers/types";

const SEVERITY_COLOR: Record<FindingSeverity, string> = {
  info: "var(--blue)",
  warning: "var(--amber)",
  critical: "var(--red)",
};

const SeverityGlyph = ({ severity }: { severity: FindingSeverity }) => {
  switch (severity) {
    case "critical":
      return (
        <CriticalIcon size={16} style={{ color: SEVERITY_COLOR.critical }} />
      );
    case "warning":
      return <WarningIcon size={16} style={{ color: SEVERITY_COLOR.warning }} />;
    default:
      return <CheckmarkIcon size={16} style={{ color: SEVERITY_COLOR.info }} />;
  }
};

const IntelligenceBadge = () => (
  <Flex
    alignItems="center"
    gap={6}
    style={{
      padding: "3px 10px",
      borderRadius: 999,
      background: "var(--intel-soft)",
      border: "1px solid color-mix(in oklab, var(--purple) 35%, transparent)",
    }}
  >
    <Text
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color: "var(--purple)",
      }}
    >
      Dynatrace Intelligence in production
    </Text>
  </Flex>
);

const AnomalyRow = ({
  anomaly,
  onClick,
}: {
  anomaly: Anomaly;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      all: "unset",
      cursor: "pointer",
      display: "block",
      width: "100%",
    }}
    aria-label={`${anomaly.category}: ${anomaly.entity}`}
  >
    <Flex
      alignItems="center"
      gap={12}
      style={{
        padding: "10px 12px",
        borderRadius: 6,
        borderLeft: `3px solid ${SEVERITY_COLOR[anomaly.severity]}`,
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <SeverityGlyph severity={anomaly.severity} />

      <Flex
        flexDirection="column"
        gap={2}
        style={{ minWidth: 0, flex: "0 0 auto", width: 140 }}
      >
        <Text
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}
        >
          {anomaly.category}
        </Text>
      </Flex>

      <Text
        style={{
          fontFamily: "var(--mono, monospace)",
          fontSize: 12.5,
          color: "var(--text)",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {anomaly.entity}
      </Text>

      <Text
        style={{
          fontFamily: "var(--mono, monospace)",
          fontSize: 12.5,
          fontWeight: 600,
          color: SEVERITY_COLOR[anomaly.severity],
          fontVariantNumeric: "tabular-nums",
          flex: "0 0 auto",
        }}
      >
        {anomaly.metric}
      </Text>

      <Text
        style={{
          fontSize: 12,
          color: "var(--text-2)",
          flex: "0 0 auto",
          maxWidth: 280,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {anomaly.context}
      </Text>

      <Flex flexGrow={1} />

      <ChevronRightIcon size={16} style={{ color: "var(--text-3)" }} />
    </Flex>
  </button>
);

const EmptyState = () => (
  <Flex
    alignItems="center"
    justifyContent="center"
    style={{
      padding: "32px 12px",
      border: "1px dashed var(--border)",
      borderRadius: 6,
      background: "var(--surface-2)",
    }}
  >
    <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
      No anomalies detected in the current scope. All four thresholds healthy.
    </Text>
  </Flex>
);

export interface AnomalyPanelProps {
  anomalies: Anomaly[];
  isLoading: boolean;
  onSelect: (anomaly: Anomaly) => void;
}

export const AnomalyPanel = ({
  anomalies,
  isLoading,
  onSelect,
}: AnomalyPanelProps) => (
  <Surface elevation="raised" padding={16}>
    <Flex flexDirection="column" gap={12}>
      <Flex alignItems="center" justifyContent="space-between">
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            AI Operational Anomalies
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Threshold-based detection · v1
          </Text>
        </Flex>
        <IntelligenceBadge />
      </Flex>

      {isLoading ? (
        <Flex flexDirection="column" gap={6}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={{ height: 44, borderRadius: 6 }} />
          ))}
        </Flex>
      ) : anomalies.length === 0 ? (
        <EmptyState />
      ) : (
        <Flex flexDirection="column" gap={6}>
          {anomalies.map((a) => (
            <AnomalyRow key={a.id} anomaly={a} onClick={() => onSelect(a)} />
          ))}
        </Flex>
      )}
    </Flex>
  </Surface>
);
