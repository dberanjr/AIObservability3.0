import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Donut } from "../../components/charts/Donut";
import type { DonutSlice } from "../../components/charts/Donut";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import {
  EmptyState,
  emptyCause,
  type EmptyStateAction,
} from "../../components/EmptyState";
import { fmtCount, fmtCountCompact } from "../../data/format";
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
import { useProviderMix } from "./useProviderMix";

const ProviderMixBody = () => {
  const result = useProviderMix();
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
  const slices: DonutSlice[] = result.shares.map((s) => ({
    key: s.provider,
    label: s.displayName,
    value: s.requests,
    color: s.color,
    sub: s.isBedrockProxy ? "via Bedrock proxy" : undefined,
    // Filter on the raw gen_ai.provider.name values that compose this slice.
    // For Bedrock-proxied vendors these collapse to "aws_bedrock", so the
    // filter is as specific as the raw attribute allows.
    filter:
      s.rawProviders.length > 0
        ? {
            attribute: "gen_ai.provider.name",
            values: s.rawProviders,
            label: "provider",
          }
        : undefined,
  }));

  return (
      <Flex flexDirection="column" gap={12} style={{ padding: 16 }}>
        {result.isLoading ? (
          <Skeleton style={{ height: 160 }} />
        ) : slices.length === 0 ? (
          <EmptyState
            bare
            cause={emptyKind}
            title={
              emptyKind === "no-activity"
                ? "No provider data in the current scope."
                : undefined
            }
            hint="gen_ai.provider.name"
            actions={remedyActions}
          />
        ) : (
          <Donut
            slices={slices}
            centerValue={fmtCountCompact(result.totalRequests)}
            centerLabel="requests"
            valueFormatter={(n) => `${fmtCount(n)} req`}
          />
        )}

        <Text style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.45 }}>
          {result.bedrockProxyCount > 0
            ? "Anthropic / Cohere / Mistral models served via AWS Bedrock are normalized back to their upstream provider — Bedrock-proxied slices are footnoted in the legend."
            : "Provider attribution reads gen_ai.provider.name and unwraps Bedrock vendor prefixes server-side."}
        </Text>
      </Flex>
  );
};

export const ProviderMixDonut = () => (
  <CollapsibleCard title="Provider mix" subtitle="by request count" defaultOpen>
    <ScanScope name="Provider mix">
      <ProviderMixBody />
    </ScanScope>
  </CollapsibleCard>
);
