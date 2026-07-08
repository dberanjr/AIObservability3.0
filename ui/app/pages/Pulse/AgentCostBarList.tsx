import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { BarList } from "../../components/charts/BarList";
import type { BarListItem } from "../../components/charts/BarList";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import {
  EmptyState,
  emptyCause,
  type EmptyStateAction,
} from "../../components/EmptyState";
import { fmtCount, fmtUSD } from "../../data/format";
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
import { useAgentCosts } from "./useAgentCosts";

const TOP_N = 8;

const AgentCostBody = () => {
  const result = useAgentCosts();
  // Read this panel's own scan telemetry (tagged by the enclosing <ScanScope>)
  // so a truncated scan surfaces the amber "Scan budget reached" empty rather
  // than a misleading "no activity" (STATE-4).
  const limitHit = useScanGroup(useScanScope())?.limitHit ?? false;
  const emptyKind = emptyCause({ error: result.error, limitHit });
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
    emptyKind === "error"
      ? []
      : emptyKind === "truncated"
        ? [{ label: raiseScanLabel, onClick: raiseScanLimit }]
        : [
            { label: "Widen timeframe", onClick: widenTimeframe },
            { label: raiseScanLabel, onClick: raiseScanLimit },
          ];
  const items: BarListItem[] = result.rows.slice(0, TOP_N).map((r) => ({
    key: r.agent,
    label: r.agent,
    value: r.cost,
    displayValue: fmtUSD(r.cost),
    secondary: `${fmtCount(r.tokens)} tokens · ${r.models.join(", ") || "model unknown"}`,
    filter: { attribute: "gen_ai.agent.name", values: [r.agent], label: "agent" },
  }));

  return (
      <Flex flexDirection="column" gap={12} style={{ padding: 16 }}>
        <Flex justifyContent="flex-end">
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Total {fmtUSD(result.totalCost)}
          </Text>
        </Flex>
        {result.isLoading ? (
          <Flex flexDirection="column" gap={8}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 32, borderRadius: 6 }} />
            ))}
          </Flex>
        ) : items.length === 0 ? (
          <EmptyState
            bare
            cause={emptyKind}
            title={
              emptyKind === "no-activity"
                ? "No agent spans with usage attributes in the current scope."
                : undefined
            }
            hint="gen_ai.usage.input_tokens · gen_ai.usage.output_tokens"
            actions={remedyActions}
          />
        ) : (
          <BarList items={items} color="var(--purple)" />
        )}
      </Flex>
  );
};

export const AgentCostBarList = () => (
  <CollapsibleCard
    title="Top agents by estimated cost"
    subtitle="cost = (input × in_price + output × out_price) per model"
    defaultOpen
  >
    <ScanScope name="Top agents by cost">
      <AgentCostBody />
    </ScanScope>
  </CollapsibleCard>
);
