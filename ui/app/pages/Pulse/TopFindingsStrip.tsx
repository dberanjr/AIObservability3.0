import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { FindingCard } from "../../components/FindingCard";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import type { Finding } from "../../components/drawers/types";
import { useAnomalies } from "./anomalies/useAnomalies";

const MAX_CARDS = 5;

export interface TopFindingsStripProps {
  onSelect: (finding: Finding) => void;
}

const IntelBadge = () => (
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
);

/**
 * Top-issues strip body — self-fetches anomalies so the query only runs while
 * the section is expanded. Inherits the Dynatrace Intelligence framing since
 * this absorbed the role of the legacy AnomalyPanel.
 */
const TopFindingsBody = ({ onSelect }: TopFindingsStripProps) => {
  const { anomalies, isLoading } = useAnomalies();
  const cards = anomalies.slice(0, MAX_CARDS);

  return (
      <Flex flexDirection="column" gap={12} style={{ padding: 16 }}>
        {!isLoading && cards.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            No issues detected in the current scope.
          </Text>
        ) : isLoading && cards.length === 0 ? (
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
  );
};

export const TopFindingsStrip = ({ onSelect }: TopFindingsStripProps) => (
  <CollapsibleCard
    title="Top issues requiring attention"
    subtitle="Threshold-based detection · click any card to investigate"
    headerRight={<IntelBadge />}
    defaultOpen
  >
    <TopFindingsBody onSelect={onSelect} />
  </CollapsibleCard>
);
