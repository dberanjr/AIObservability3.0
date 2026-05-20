import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { FindingCard } from "../../components/FindingCard";
import type { Finding } from "../../components/drawers/types";

export interface ExplorerFindingsProps {
  findings: Finding[];
  isLoading: boolean;
  onSelect: (finding: Finding) => void;
}

export const ExplorerFindings = ({
  findings,
  isLoading,
  onSelect,
}: ExplorerFindingsProps) => {
  if (isLoading && findings.length === 0) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(5, minmax(0, 1fr))`,
          gap: 12,
        }}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} style={{ height: 120, borderRadius: 10 }} />
        ))}
      </div>
    );
  }

  if (findings.length === 0) {
    return (
      <Flex style={{ padding: "8px 4px" }}>
        <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
          No findings surfaced in the current scope.
        </Text>
      </Flex>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(findings.length, 5)}, minmax(0, 1fr))`,
        gap: 12,
      }}
    >
      {findings.map((f) => (
        <FindingCard key={f.id} finding={f} onClick={onSelect} />
      ))}
    </div>
  );
};
