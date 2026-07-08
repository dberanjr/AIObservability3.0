import React from "react";
import { Skeleton } from "@dynatrace/strato-components/content";
import { FindingCard } from "../../components/FindingCard";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { EmptyState } from "../../components/EmptyState";
import type { Finding } from "../../components/drawers/types";

export interface ExplorerFindingsProps {
  findings: Finding[];
  isLoading: boolean;
  onSelect: (finding: Finding) => void;
}

const ExplorerFindingsBody = ({
  findings,
  isLoading,
  onSelect,
}: ExplorerFindingsProps) => {
  // A fixed responsive track keeps cards a stable width regardless of how many
  // heuristics fired (2 findings no longer stretch to full width), left-aligned
  // and wrapping instead of restretching (Explorer-11). auto-fill (not auto-fit)
  // leaves empty tracks so a couple of cards don't balloon.
  const GRID_COLUMNS = "repeat(auto-fill, minmax(220px, 1fr))";

  if (isLoading && findings.length === 0) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: GRID_COLUMNS,
          gap: 12,
          padding: 12,
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
      <EmptyState
        bare
        cause="no-activity"
        title="No findings surfaced in the current scope."
      />
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: GRID_COLUMNS,
        gap: 12,
        padding: 12,
      }}
    >
      {findings.map((f) => (
        <FindingCard key={f.id} finding={f} onClick={onSelect} />
      ))}
    </div>
  );
};

export const ExplorerFindings = (props: ExplorerFindingsProps) => (
  <CollapsibleCard title="Findings" defaultOpen>
    <ExplorerFindingsBody {...props} />
  </CollapsibleCard>
);
