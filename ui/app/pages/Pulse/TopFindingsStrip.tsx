import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Skeleton } from "@dynatrace/strato-components/content";
import { FindingCard } from "../../components/FindingCard";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { EmptyState, emptyCause } from "../../components/EmptyState";
import type { Finding } from "../../components/drawers/types";
import {
  ScanScope,
  useScanGroup,
  useScanScope,
} from "../../scope/ScanReportContext";
import { useAnomalies } from "./anomalies/useAnomalies";

const MAX_CARDS = 5;

export interface TopFindingsStripProps {
  onSelect: (finding: Finding) => void;
  showExample?: boolean;
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
const TopFindingsBody = ({ onSelect, showExample = false }: TopFindingsStripProps) => {
  const { anomalies, isLoading, error } = useAnomalies(showExample);
  const cards = anomalies.slice(0, MAX_CARDS);
  // Read this panel's own scan telemetry (tagged by the enclosing <ScanScope>)
  // so a truncated scan surfaces the amber "Scan budget reached" empty rather
  // than a misleading "no activity" (STATE-4). A query error already wins via
  // emptyCause precedence, so a failed detection never reads as "no issues".
  const limitHit = useScanGroup(useScanScope())?.limitHit ?? false;
  const emptyKind = emptyCause({ error, limitHit });

  return (
      <Flex flexDirection="column" gap={12} style={{ padding: 16 }}>
        {!isLoading && cards.length === 0 ? (
          <EmptyState
            bare
            cause={emptyKind}
            title={
              emptyKind === "no-activity"
                ? "No issues detected in the current scope."
                : undefined
            }
          />
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

export const TopFindingsStrip = ({ onSelect, showExample = false }: TopFindingsStripProps) => (
  <CollapsibleCard
    title="Top issues requiring attention"
    subtitle="Threshold-based detection · click any card to investigate"
    headerRight={<IntelBadge />}
    defaultOpen
  >
    <ScanScope name="Top issues">
      <TopFindingsBody onSelect={onSelect} showExample={showExample} />
    </ScanScope>
  </CollapsibleCard>
);
