import React from "react";
import { Skeleton } from "@dynatrace/strato-components/content";
import { FindingCard } from "../../components/FindingCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import type { Finding } from "../../components/drawers/types";
import { SummaryCard } from "./SummaryCard";
import { useAnomalies } from "../Pulse/anomalies/useAnomalies";

const MAX_CARDS = 6;

const IntelBadge = () => (
  <span
    style={{
      fontSize: 9.5,
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "var(--purple-2)",
      background: "var(--intel-soft)",
      border: "1px solid var(--purple-2)",
      borderRadius: 999,
      padding: "2px 8px",
      whiteSpace: "nowrap",
    }}
  >
    Dynatrace Intelligence
  </span>
);

/**
 * Top findings: the same threshold-detected anomalies Pulse surfaces (each
 * tagged with its architecture layer), in a two-column grid. Clicking a card
 * opens the shared finding drawer (drill-outs to Traces / Services / Problems /
 * contributing prompts); the header drills to Pulse. Reuses useAnomalies +
 * FindingCard so nothing is re-derived.
 */
export const TopFindingsCard = ({
  onSelect,
}: {
  onSelect: (finding: Finding) => void;
}) => {
  const { anomalies, isLoading, error } = useAnomalies();
  const cards = anomalies.slice(0, MAX_CARDS);

  return (
    <SummaryCard
      title="Top findings"
      info="Threshold-detected anomalies — the same findings Pulse surfaces, each tagged with its architecture layer, showing the top 6 by the detectors' ranking. This reflects the detectors' instrumented inputs; an empty list is not a guaranteed all-clear. Click a card to open the shared finding drawer (drill-outs to Traces / Services / Problems / contributing prompts)."
      drill={{ label: "Pulse", to: "/pulse" }}
      headerRight={<IntelBadge />}
    >
      {isLoading && cards.length === 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} style={{ height: 96, borderRadius: 10 }} />
          ))}
        </div>
      ) : error ? (
        // Never let a failed findings query read as "no issues detected" (SUM-3).
        <ErrorState bare error={error} />
      ) : cards.length === 0 ? (
        <EmptyState
          bare
          title="No signals in this window"
          description="No threshold anomalies fired for the current scope and timeframe. This reflects the detectors' inputs — it depends on the underlying metrics being instrumented."
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 10,
          }}
        >
          {cards.map((f) => (
            <FindingCard key={f.id} finding={f} onClick={onSelect} />
          ))}
        </div>
      )}
    </SummaryCard>
  );
};
