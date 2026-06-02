import React from "react";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import {
  CriticalIcon,
  WarningIcon,
  CheckmarkIcon,
} from "@dynatrace/strato-icons";
import {
  DEFAULT_FINDING_INTENTS,
  type Finding,
  type FindingIntent,
  type FindingSeverity,
} from "./types";
import { dispatchIntent } from "../../lib/intents";

const SEVERITY_COLOR: Record<FindingSeverity, string> = {
  info: "var(--blue)",
  warning: "var(--amber)",
  critical: "var(--red)",
};

const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  info: "Info",
  warning: "Warning",
  critical: "Critical",
};

const SeverityIcon = ({ severity }: { severity: FindingSeverity }) => {
  switch (severity) {
    case "critical":
      return <CriticalIcon size={16} style={{ color: SEVERITY_COLOR.critical }} />;
    case "warning":
      return <WarningIcon size={16} style={{ color: SEVERITY_COLOR.warning }} />;
    default:
      return <CheckmarkIcon size={16} style={{ color: SEVERITY_COLOR.info }} />;
  }
};

const SeverityPill = ({ severity }: { severity: FindingSeverity }) => (
  <Flex
    alignItems="center"
    gap={6}
    style={{
      padding: "4px 10px",
      borderRadius: 999,
      background: `color-mix(in oklab, ${SEVERITY_COLOR[severity]} 14%, transparent)`,
      border: `1px solid color-mix(in oklab, ${SEVERITY_COLOR[severity]} 40%, transparent)`,
      alignSelf: "flex-start",
    }}
  >
    <SeverityIcon severity={severity} />
    <Text
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: SEVERITY_COLOR[severity],
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {SEVERITY_LABEL[severity]}
    </Text>
  </Flex>
);

const formatTime = (ms?: number): string | null => {
  if (!ms) return null;
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return null;
  }
};

export interface FindingDrawerProps {
  finding: Finding | null;
  onDismiss: () => void;
}

/**
 * Build the click handler for a finding intent. If the caller pre-set
 * `onClick`, use it verbatim. Otherwise, when `intent` is set, dispatch the
 * platform intent with the current finding's entity as context.
 */
const handlerFor = (
  intent: FindingIntent,
  finding: Finding,
): (() => void) | undefined => {
  if (intent.onClick) return intent.onClick;
  if (intent.intent) {
    return () =>
      dispatchIntent(intent.intent!, {
        entity: finding.entity,
        startMs: finding.timestampMs,
      });
  }
  return undefined;
};

export const FindingDrawer = ({ finding, onDismiss }: FindingDrawerProps) => {
  const intents = finding?.intents ?? DEFAULT_FINDING_INTENTS;
  const timestamp = formatTime(finding?.timestampMs);

  return (
    <Sheet
      show={Boolean(finding)}
      title={finding?.category ?? ""}
      onDismiss={onDismiss}
      aria-label="Finding details"
    >
      {finding && (
        <Flex
          flexDirection="column"
          gap={16}
          style={{ width: 480, maxWidth: "100%" }}
        >
          <SeverityPill severity={finding.severity} />

          <Flex flexDirection="column" gap={4}>
            <Text
              style={{
                fontFamily: "var(--mono, monospace)",
                fontSize: 13,
                color: "var(--text-2)",
              }}
            >
              {finding.entity}
            </Text>
            <Heading
              level={2}
              style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2 }}
            >
              {finding.metric}
            </Heading>
            <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
              {finding.context}
            </Text>
          </Flex>

          {/* 24h trend sparkline — pending Session 5 chart components. */}
          <div
            aria-hidden
            style={{
              height: 60,
              borderRadius: 6,
              background: "var(--surface-2)",
              border: "1px dashed var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
              24h trend — sparkline arrives with the Pulse charts session
            </Text>
          </div>

          {finding.detail && (
            <Text style={{ fontSize: 13, color: "var(--text-2)" }}>
              {finding.detail}
            </Text>
          )}

          <Flex flexDirection="column" gap={8}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text-3)",
              }}
            >
              Continue the investigation
            </Text>
            <Flex flexDirection="column" gap={6}>
              {intents.map((intent) => {
                const onClick = handlerFor(intent, finding);
                return (
                  <Button
                    key={intent.label}
                    variant="default"
                    onClick={onClick}
                    disabled={!onClick}
                    title={intent.hint}
                  >
                    {intent.label}
                  </Button>
                );
              })}
            </Flex>
          </Flex>

          {timestamp && (
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
              Detected {timestamp}
            </Text>
          )}
        </Flex>
      )}
    </Sheet>
  );
};
