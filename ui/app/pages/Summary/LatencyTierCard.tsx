import React from "react";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Text } from "@dynatrace/strato-components/typography";
import { StackedBar, type StackedSegment } from "../../components/charts/StackedBar";
import { fmtMs } from "../../data/format";
import { SummaryCard } from "./SummaryCard";
import { useLatencyDecomposition } from "../Agents/useLatencyDecomposition";
import type { LatencyTier } from "../Agents/useLatencyDecomposition";
import type { PulseSummary } from "../Pulse/usePulseSummary";

const TIER_COLOR: Record<LatencyTier, string> = {
  LLM: "var(--blue)",
  "Retrieval/DB": "var(--cyan)",
  Tool: "var(--purple-2)",
  Orchestration: "var(--amber)",
};

/**
 * Latency-by-tier donut: the share of wall-clock time spent in LLM generation /
 * tool calls / retrieval / orchestration (from useLatencyDecomposition). Center
 * shows the fleet P95 (passed from the shared summary). Drills to Agents.
 */
export const LatencyTierCard = ({ summary }: { summary: PulseSummary }) => {
  const { tiers, isLoading } = useLatencyDecomposition();

  const segs: StackedSegment[] = tiers
    .filter((t) => t.sharePct > 0)
    .map((t) => ({
      key: t.tier,
      label: t.tier,
      value: t.sharePct,
      color: TIER_COLOR[t.tier],
      sub: `${fmtMs(t.p95Ms)} p95`,
    }));

  return (
    <SummaryCard title="Latency by tier" subtitle="share of wall-clock time" drill={{ label: "Agents", to: "/agents" }}>
      {isLoading && segs.length === 0 ? (
        <Skeleton style={{ height: 130, borderRadius: 8 }} />
      ) : segs.length === 0 ? (
        <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>No latency data in scope.</Text>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>P95</span>
            <span style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>
              {fmtMs(summary.p95Ms)}
            </span>
          </div>
          <StackedBar segments={segs} height={16} />
        </div>
      )}
    </SummaryCard>
  );
};
