import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { BarList } from "../../components/charts/BarList";
import type { BarListItem } from "../../components/charts/BarList";
import { fmtMs, fmtPercent } from "../../data/format";
import type { Tool } from "./useTools";

const IntelChip = ({ children }: { children: React.ReactNode }) => (
  <span
    style={{
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 10.5,
      fontWeight: 600,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      background: "var(--intel-soft)",
      color: "var(--purple)",
    }}
  >
    {children}
  </span>
);

interface PanelProps {
  title: string;
  sub: string;
  items: BarListItem[];
  isLoading: boolean;
  empty: string;
  badge?: React.ReactNode;
  color?: string | ((item: BarListItem) => string);
}

const Panel = ({
  title,
  sub,
  items,
  isLoading,
  empty,
  badge,
  color,
}: PanelProps) => (
  <Surface elevation="raised" padding={16}>
    <Flex flexDirection="column" gap={12}>
      <Flex alignItems="baseline" justifyContent="space-between">
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            {title}
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            {sub}
          </Text>
        </Flex>
        {badge}
      </Flex>
      {isLoading && items.length === 0 ? (
        <Flex flexDirection="column" gap={8}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} style={{ height: 32, borderRadius: 6 }} />
          ))}
        </Flex>
      ) : items.length === 0 ? (
        <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>{empty}</Text>
      ) : (
        <BarList items={items} color={color ?? "var(--amber)"} />
      )}
    </Flex>
  </Surface>
);

export interface SidePanelsProps {
  tools: Tool[];
  isLoading: boolean;
}

export const SidePanels = ({ tools, isLoading }: SidePanelsProps) => {
  const topRetry = [...tools]
    .filter((t) => t.retryRatePct > 0)
    .sort((a, b) => b.retryRatePct - a.retryRatePct)
    .slice(0, 6)
    .map<BarListItem>((t) => ({
      key: `retry-${t.tool}`,
      label: t.tool,
      value: t.retryRatePct,
      displayValue: fmtPercent(t.retryRatePct, 2),
      secondary: `${t.service} · ${t.retryTotal} retries`,
    }));

  const slowestP99 = [...tools]
    .sort((a, b) => b.p99Ms - a.p99Ms)
    .slice(0, 6)
    .map<BarListItem>((t) => ({
      key: `p99-${t.tool}`,
      label: t.tool,
      value: t.p99Ms,
      displayValue: fmtMs(t.p99Ms),
      secondary: `${t.service} · ${t.category}`,
    }));

  return (
    <Flex flexDirection="column" gap={16}>
      <Panel
        title="Top retry rate"
        sub="Retries as a percentage of all tool calls"
        items={topRetry}
        isLoading={isLoading}
        empty="No retries observed. Needs gen_ai.tool.retry_count instrumentation."
        badge={<IntelChip>AI-specific signal</IntelChip>}
        color="var(--amber)"
      />
      <Panel
        title="Slowest by P99"
        sub="Tools with the worst tail latency"
        items={slowestP99}
        isLoading={isLoading}
        empty="No tool latency data."
        color={(item) => (item.value > 5000 ? "var(--red)" : "var(--amber)")}
      />
    </Flex>
  );
};
