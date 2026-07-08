/**
 * RAG / vector-database panel (Explorer). Auto-rendered by CapabilityGate when
 * the tenant emits db.system / vector_db.* attributes.
 */

import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { MiniStat } from "../../components/MiniStat";
import { BarList, type BarListItem } from "../../components/charts/BarList";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { ErrorState } from "../../components/ErrorState";
import {
  EmptyState,
  emptyCause,
  type EmptyStateAction,
} from "../../components/EmptyState";
import { fmtCount } from "../../data/format";
import { useScope } from "../../scope/ScopeContext";
import {
  SCAN_LIMITS_GB,
  SCAN_LIMIT_LABELS,
  useScanLimit,
} from "../../scope/ScanLimitContext";
import { useScanGroup, useScanScope } from "../../scope/ScanReportContext";
import { TIME_PRESETS } from "../../scope/types";
import { useRag } from "./useRag";

// Body is a separate component so useRag (self-fetching DQL) only runs while
// the section is expanded — collapsing unmounts the body and issues no query.
const RagPanelBody = () => {
  const r = useRag();
  // Read this panel's own scan telemetry (tagged by the enclosing <ScanScope>
  // in ExplorerPage's ScanScopedTile) so a truncated scan surfaces the amber
  // "Scan budget reached" empty rather than a misleading "no activity" (STATE-4).
  const limitHit = useScanGroup(useScanScope())?.limitHit ?? false;
  const emptyKind = emptyCause({ error: r.error, limitHit });

  // Empty-state remedies wired to the real scope / scan-limit setters, so a
  // retrieval panel that resolves to nothing (no activity in scope, or the
  // retrieval spans fell outside the scan budget) offers one-click widen /
  // raise instead of a dead zero-row panel (STATE-4 / STATE-6). A truncated
  // scan skips "widen" (that scans MORE); an error offers neither.
  const { scope, setTimeframe } = useScope();
  const { scanLimitGb, setScanLimit } = useScanLimit();
  const tfOrder = TIME_PRESETS.map((p) => p.value);
  const tfIdx = tfOrder.indexOf(scope.timeframe.from);
  const nextTf =
    tfIdx === -1
      ? "now()-24h"
      : tfIdx < tfOrder.length - 1
        ? tfOrder[tfIdx + 1]
        : null;
  const widenTimeframe = nextTf ? () => setTimeframe({ from: nextTf }) : undefined;
  const scanIdx = SCAN_LIMITS_GB.indexOf(scanLimitGb);
  const nextScan =
    scanIdx >= 0 && scanIdx < SCAN_LIMITS_GB.length - 1
      ? SCAN_LIMITS_GB[scanIdx + 1]
      : null;
  const raiseScanLimit = nextScan != null ? () => setScanLimit(nextScan) : undefined;
  const raiseScanLabel =
    nextScan != null
      ? `Raise scan limit to ${SCAN_LIMIT_LABELS[nextScan]}`
      : "Scan limit at max";
  const remedyActions: EmptyStateAction[] =
    emptyKind === "error"
      ? []
      : emptyKind === "truncated"
        ? [{ label: raiseScanLabel, onClick: raiseScanLimit }]
        : [
            { label: "Widen timeframe", onClick: widenTimeframe },
            { label: raiseScanLabel, onClick: raiseScanLimit },
          ];

  const items: BarListItem[] = r.stores.map((s) => ({
    key: s.system,
    label: s.system,
    value: s.queries,
    displayValue: fmtCount(s.queries),
    secondary: s.avgTopK > 0 ? `avg top-k ${s.avgTopK.toFixed(1)}` : undefined,
    filter: { attribute: "db.system", values: [s.system], label: "vector store" },
  }));

  return (
    <Flex flexDirection="column" gap={12} style={{ padding: 16 }}>
      {r.isLoading ? (
        <Skeleton style={{ height: 84, borderRadius: 6 }} />
      ) : r.error ? (
        <ErrorState
          title="Couldn't load retrieval data"
          error={r.error}
          bare
        />
      ) : r.stores.length === 0 ? (
        <EmptyState
          bare
          cause={emptyKind}
          title={
            emptyKind === "no-activity" ? "No retrievals in this scope" : undefined
          }
          description={
            emptyKind === "no-activity"
              ? "No vector-store retrieval spans matched the current scope or scan budget. Widen the timeframe or raise the scan limit to capture more."
              : undefined
          }
          hint="db.system · vector_db.query.top_k · vector_db.results"
          actions={remedyActions}
        />
      ) : (
        <Flex flexDirection="column" gap={12}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 12,
            }}
          >
            <MiniStat
              label="Retrievals"
              value={fmtCount(r.totalQueries)}
              color="var(--cyan)"
            />
            <MiniStat label="Vector stores" value={fmtCount(r.storeCount)} />
            <MiniStat
              label="Avg top-k"
              value={r.avgTopK > 0 ? r.avgTopK.toFixed(1) : "—"}
              sub="results requested"
            />
          </div>
          {items.length > 0 && (
            <Flex flexDirection="column" gap={6}>
              <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                Retrievals by store
              </Text>
              <BarList items={items} color="var(--cyan)" />
            </Flex>
          )}
        </Flex>
      )}
    </Flex>
  );
};

export const RagPanel = () => (
  <CollapsibleCard
    title="Retrieval (RAG)"
    subtitle={
      <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
        From <code>db.system</code> / <code>vector_db.*</code> — surfaced
        because your telemetry now emits retrieval spans.
      </Text>
    }
    defaultOpen
  >
    <RagPanelBody />
  </CollapsibleCard>
);
