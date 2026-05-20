import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { ChevronRightIcon } from "@dynatrace/strato-icons";
import type { Finding, FindingSeverity } from "./drawers/types";

const SEVERITY_COLOR: Record<FindingSeverity, string> = {
  info: "var(--blue)",
  warning: "var(--amber)",
  critical: "var(--red)",
};

export interface FindingCardProps {
  finding: Finding;
  onClick?: (finding: Finding) => void;
}

/**
 * Standard top-findings card (DESIGN_HANDOFF §3). Category eyebrow + status dot,
 * mono entity, large severity-colored metric, secondary context line, hover arrow.
 */
export const FindingCard = ({ finding, onClick }: FindingCardProps) => {
  const interactive = Boolean(onClick);
  const content = (
    <Surface
      elevation="raised"
      padding={12}
      style={{
        position: "relative",
        height: "100%",
        cursor: interactive ? "pointer" : "default",
      }}
    >
      <Flex flexDirection="column" gap={6} style={{ minWidth: 0 }}>
        <Flex alignItems="center" gap={6}>
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: SEVERITY_COLOR[finding.severity],
              flex: "0 0 auto",
            }}
          />
          <Text
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-3)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {finding.category}
          </Text>
        </Flex>

        <Text
          style={{
            fontFamily: "var(--mono, monospace)",
            fontSize: 12.5,
            color: "var(--text-2)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {finding.entity}
        </Text>

        <Text
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: SEVERITY_COLOR[finding.severity],
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1.1,
          }}
        >
          {finding.metric}
        </Text>

        <Text style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.35 }}>
          {finding.context}
        </Text>
      </Flex>

      {interactive && (
        <ChevronRightIcon
          size={16}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            color: "var(--text-3)",
          }}
        />
      )}
    </Surface>
  );

  if (!interactive) return content;
  return (
    <button
      type="button"
      onClick={() => onClick?.(finding)}
      style={{ all: "unset", display: "block", height: "100%" }}
      aria-label={`${finding.category}: ${finding.entity}`}
    >
      {content}
    </button>
  );
};
