import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Skeleton } from "@dynatrace/strato-components/content";
import { BarList } from "../../components/charts/BarList";
import type { BarListItem } from "../../components/charts/BarList";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import {
  EmptyState,
  emptyCause,
  type EmptyStateAction,
} from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { fmtCount } from "../../data/format";
import { useScope } from "../../scope/ScopeContext";
import { TIME_PRESETS } from "../../scope/types";
import {
  SCAN_LIMITS_GB,
  SCAN_LIMIT_LABELS,
  useScanLimit,
} from "../../scope/ScanLimitContext";
import {
  ScanScope,
  useScanGroup,
  useScanScope,
} from "../../scope/ScanReportContext";
import { useModels, type ModelRow } from "../Models/useModels";

export interface TopModelsPanelProps {
  models: ModelRow[];
  isLoading: boolean;
  /** Query error from the self-fetching wrapper — drives the error branch. */
  error?: Error;
  /** Bound retry that re-runs the underlying models query. */
  onRetry?: () => void;
}

const TOP_N = 6;

export const TopModelsPanel = ({
  models,
  isLoading,
  error,
  onRetry,
}: TopModelsPanelProps) => {
  const items = useMemo<BarListItem[]>(
    () =>
      [...models]
        .sort(
          (a, b) =>
            b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens),
        )
        .slice(0, TOP_N)
        .map((m) => ({
          key: m.modelKey,
          label: m.model,
          value: m.inputTokens + m.outputTokens,
          displayValue: fmtCount(m.inputTokens + m.outputTokens),
          secondary: `${m.provider.label} · ${m.requests.toLocaleString()} req`,
          filter: {
            attribute: "gen_ai.request.model",
            values: m.rawModels,
            label: "model",
          },
        })),
    [models],
  );

  const colorFor = (item: BarListItem) =>
    models.find((m) => m.modelKey === item.key)?.providerColor ?? "var(--blue)";

  // Read this panel's own scan telemetry (tagged by the enclosing <ScanScope>)
  // so a truncated scan surfaces the amber "Scan budget reached" empty rather
  // than a misleading "no activity" (STATE-4).
  const limitHit = useScanGroup(useScanScope())?.limitHit ?? false;
  const emptyKind = emptyCause({ error, limitHit });
  // Empty-state remedies wired to the real scope / scan-limit setters, so a
  // scope-driven empty offers one-click widen / raise instead of inert prose
  // (STATE-6). A truncated scan skips "widen" (that scans MORE); an error offers
  // neither. Buttons disable themselves at the widest preset / max scan budget.
  const { scope, setTimeframe } = useScope();
  const { scanLimitGb, setScanLimit } = useScanLimit();
  const tfOrder = TIME_PRESETS.map((p) => p.value);
  const tfIdx = tfOrder.indexOf(scope.timeframe.from);
  const nextTf =
    tfIdx === -1 ? "now()-24h" : tfIdx < tfOrder.length - 1 ? tfOrder[tfIdx + 1] : null;
  const widenTimeframe = nextTf ? () => setTimeframe({ from: nextTf }) : undefined;
  const scanIdx = SCAN_LIMITS_GB.indexOf(scanLimitGb);
  const nextScan =
    scanIdx >= 0 && scanIdx < SCAN_LIMITS_GB.length - 1 ? SCAN_LIMITS_GB[scanIdx + 1] : null;
  const raiseScanLimit = nextScan != null ? () => setScanLimit(nextScan) : undefined;
  const raiseScanLabel =
    nextScan != null ? `Raise scan limit to ${SCAN_LIMIT_LABELS[nextScan]}` : "Scan limit at max";
  const remedyActions: EmptyStateAction[] =
    emptyKind === "truncated"
      ? [{ label: raiseScanLabel, onClick: raiseScanLimit }]
      : [
          { label: "Widen timeframe", onClick: widenTimeframe },
          { label: raiseScanLabel, onClick: raiseScanLimit },
        ];

  return (
      <Flex flexDirection="column" gap={12} style={{ padding: 16 }}>
        {isLoading && items.length === 0 ? (
          <Flex flexDirection="column" gap={8}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 32, borderRadius: 6 }} />
            ))}
          </Flex>
        ) : error ? (
          <ErrorState
            title="Couldn't load top models"
            error={error}
            onRetry={onRetry}
            bare
          />
        ) : items.length === 0 ? (
          <EmptyState
            bare
            cause={emptyKind}
            title={
              emptyKind === "no-activity"
                ? "No model data in the current scope."
                : undefined
            }
            hint="gen_ai.request.model"
            actions={remedyActions}
          />
        ) : (
          <BarList items={items} color={colorFor} />
        )}
      </Flex>
  );
};

/**
 * Pulse-local self-fetching wrapper: calls useModels() and renders the
 * presentational TopModelsPanel inside a CollapsibleCard, so the query only
 * runs while the section is expanded. A <ScanScope> tags the query's scan
 * telemetry so the panel can detect a truncated scan; the Retry button remounts
 * the fetcher (via a nonce key) to re-run the failed query, since useModels does
 * not expose its own refetch.
 */
export const TopModelsCard = () => {
  const [reloadNonce, setReloadNonce] = useState(0);
  return (
    <CollapsibleCard
      title="Top models"
      subtitle="by token volume (input + output)"
      defaultOpen
    >
      <ScanScope name="Top models">
        <TopModelsFetcher
          key={reloadNonce}
          onRetry={() => setReloadNonce((n) => n + 1)}
        />
      </ScanScope>
    </CollapsibleCard>
  );
};

const TopModelsFetcher = ({ onRetry }: { onRetry: () => void }) => {
  const { models, isLoading, error } = useModels();
  return (
    <TopModelsPanel
      models={models}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
    />
  );
};
