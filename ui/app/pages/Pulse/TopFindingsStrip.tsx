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
 * Same Finding shape as AnomalyPanel rows so we can render both views from a
 * single source.
 */
export const TopFindingsStrip = ({
  findings,
  isLoading,
  onSelect,
}: TopFindingsStripProps) => {
  const cards = findings.slice(0, MAX_CARDS);
  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="baseline" justifyContent="space-between">
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Top issues requiring attention
          </Heading>
          <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
            Surfaced by Dynatrace Intelligence · click any card to investigate
          </Text>
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
        ) : cards.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            No issues surfaced in the current scope. All thresholds healthy.
          </Text>
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
