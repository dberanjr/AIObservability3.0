import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Skeleton } from "@dynatrace/strato-components/content";
import { ExternalLinkIcon, FilterIcon, XmarkIcon } from "@dynatrace/strato-icons";
import { AreaChart, type AxisTick, type ChartTimeDomain } from "../../components/charts/AreaChart";
import { fmtCount, fmtMs, fmtPercent } from "../../data/format";
import { openInTraces, openInServices } from "../../lib/intents";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import { useScope } from "../../scope/ScopeContext";
import { TIER_COLOR, TIER_LABEL, type AggNode, type AggTier } from "./useAggregateTopology";
import { useTopologyNodeDetail } from "./useTopologyNodeDetail";

const filterAttrFor = (tier: AggTier): string => {
  switch (tier) {
    case "agent":
      return "gen_ai.agent.name";
    case "tool":
      return "gen_ai.tool.name";
    case "model":
      return "gen_ai.request.model";
    case "provider":
      return "gen_ai.provider.name";
    default:
      return "service.name";
  }
};

const isServiceTier = (t: AggTier): boolean =>
  t === "service" || t === "upstream" || t === "downstream";

const Metric = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <Flex flexDirection="column" gap={2} style={{ minWidth: 0 }}>
    <Text style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)" }}>
      {label}
    </Text>
    <Text style={{ fontSize: 17, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: color ?? "var(--text)" }}>
      {value}
    </Text>
  </Flex>
);

export interface TopologyNodePanelProps {
  node: AggNode;
  onClose: () => void;
  onIsolate: () => void;
  isolated: boolean;
}

export const TopologyNodePanel = ({ node, onClose, onIsolate, isolated }: TopologyNodePanelProps) => {
  const detail = useTopologyNodeDetail(node);
  const { upsertCondition } = useGlobalFilters();
  const { setTimeframe } = useScope();

  const xDomain = useMemo<ChartTimeDomain | undefined>(() => {
    const len = detail.series.calls.length;
    if (len <= 1) return undefined;
    return {
      startMs: detail.series.startMs,
      endMs: detail.series.startMs + len * detail.series.intervalMs,
    };
  }, [detail.series.calls.length, detail.series.startMs, detail.series.intervalMs]);

  const axisTicks = useMemo<AxisTick[]>(() => {
    const len = detail.series.labels.length;
    if (len <= 1) return [];
    const count = Math.min(6, len);
    return Array.from({ length: count }, (_, k) => {
      const idx = Math.round((k / (count - 1)) * (len - 1));
      return { index: idx, label: detail.series.labels[idx] ?? "" };
    });
  }, [detail.series.labels]);

  const applyFilter = () => upsertCondition(filterAttrFor(node.tier), [node.label]);

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12} style={{ minWidth: 0 }}>
        <Flex justifyContent="space-between" alignItems="flex-start" gap={12}>
          <Flex alignItems="center" gap={8} style={{ minWidth: 0 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: TIER_COLOR[node.tier], flex: "0 0 auto" }} />
            <Flex flexDirection="column" gap={2} style={{ minWidth: 0 }}>
              <Heading level={3} style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {node.label}
              </Heading>
              <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{TIER_LABEL[node.tier]}</Text>
            </Flex>
          </Flex>
          <button type="button" onClick={onClose} aria-label="Close" style={{ all: "unset", cursor: "pointer", color: "var(--text-3)" }}>
            <XmarkIcon size={16} />
          </button>
        </Flex>

        {/* RED metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(78px, 1fr))", gap: 12 }}>
          {detail.isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} style={{ height: 34 }} />)
          ) : (
            <>
              <Metric label="Calls" value={fmtCount(detail.red.calls)} />
              <Metric label="Err rate" value={fmtPercent(detail.red.errorRatePct, 2)} color={detail.red.errorRatePct > 0 ? "var(--red)" : undefined} />
              <Metric label="P50" value={fmtMs(detail.red.p50Ms)} />
              <Metric label="P90" value={fmtMs(detail.red.p90Ms)} color={detail.red.p90Ms >= 5000 ? "var(--amber)" : undefined} />
              <Metric label="P99" value={fmtMs(detail.red.p99Ms)} />
            </>
          )}
        </div>

        {/* Volume + latency chart */}
        {detail.isLoading ? (
          <Skeleton style={{ height: 200 }} />
        ) : detail.series.calls.length <= 1 ? (
          <Flex alignItems="center" justifyContent="center" style={{ height: 120, color: "var(--text-3)", fontSize: 12 }}>
            Not enough data points to plot a trend in this window.
          </Flex>
        ) : (
          <Flex flexDirection="column" gap={4}>
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
              Call volume (area) &amp; p90 latency (line) · per {detail.series.intervalLabel} · drag to zoom the timeframe
            </Text>
            <AreaChart
              height={200}
              formatLeft={(n) => fmtCount(Math.round(n))}
              formatRight={(n) => fmtMs(n)}
              xLabels={detail.series.labels}
              axisTicks={axisTicks}
              xDomain={xDomain}
              onBrushSelect={(range) => setTimeframe(range)}
              series={[
                { label: "Calls", color: "var(--blue)", values: detail.series.calls, axis: "left" },
                { label: "p90 latency", color: "var(--purple-2)", values: detail.series.p90Ms, axis: "right" },
              ]}
            />
          </Flex>
        )}

        {/* Actions */}
        <Flex gap={8} style={{ flexWrap: "wrap" }}>
          <Button onClick={applyFilter}>
            <Button.Prefix><FilterIcon /></Button.Prefix>
            Filter all pages
          </Button>
          <Button onClick={onIsolate} variant={isolated ? "accent" : "default"}>
            {isolated ? "Show all" : "Isolate"}
          </Button>
          <Button onClick={() => openInTraces({ entity: node.label })}>
            <Button.Prefix><ExternalLinkIcon /></Button.Prefix>
            Open traces
          </Button>
          {isServiceTier(node.tier) && (
            <Button onClick={() => openInServices({ entity: node.label })}>
              <Button.Prefix><ExternalLinkIcon /></Button.Prefix>
              Open in Services
            </Button>
          )}
        </Flex>
      </Flex>
    </Surface>
  );
};
