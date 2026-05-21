import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { FindingCard } from "../../components/FindingCard";
import type { Finding } from "../../components/drawers/types";

const MAX_CARDS = 5;

export interface TopFindingsStripProps {
  findings: Finding[];
  isLoading: boolean;
  onSelect: (finding: Finding) => void;
}

/**
 * Top-issues strip on Pulse — up to 5 finding cards laid out across the row.
 * Renders nothing when there are no findings and nothing is loading (per the
 * "hide when empty" UX rule). Inherits the Dynatrace Intelligence framing
 * since this absorbed the role of the legacy AnomalyPanel.
 */
export const TopFindingsStrip = ({
  findings,
  isLoading,
  onSelect,
}: TopFindingsStripProps) => {
  const cards = findings.slice(0, MAX_CARDS);

  // Hide the entire surface when there's nothing to show — empty-state copy
  // here was visually noisy when the platform is healthy.
  if (!isLoading && cards.length === 0) return null;

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="baseline" justifyContent="space-between" gap={12}>
          <Flex flexDirection="column" gap={2}>
            <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
              Top issues requiring attention
            </Heading>
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
              Threshold-based detection · click any card to investigate
            </Text>
          </Flex>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--purple-2)",
              background: "var(--intel-soft)",
              border: "1px solid var(--purple-2)",
              borderRadius: 999,
              padding: "3px 10px",
              whiteSpace: "nowrap",
            }}
          >
            Dynatrace Intelligence
          </span>
        </Flex>

        {isLoading && cards.length === 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${MAX_CARDS}, minmax(0, 1fr))`,
              gap: 10,
            }}
          >
            {Array.from({ length: MAX_CARDS }).map((_, i) => (
              <Skeleton key={i} style={{ height: 110, borderRadius: 10 }} />
            ))}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${MAX_CARDS}, minmax(0, 1fr))`,
              gap: 10,
            }}
          >
            {cards.map((f) => (
              <FindingCard key={f.id} finding={f} onClick={onSelect} />
            ))}
          </div>
        )}
      </Flex>
    </Surface>
  );
};
