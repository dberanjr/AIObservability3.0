import React from "react";
import { Skeleton } from "@dynatrace/strato-components/content";
import { StackedBar, type StackedSegment } from "../../components/charts/StackedBar";
import { fmtMs } from "../../data/format";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
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
  const { tiers, isLoading, error } = useLatencyDecomposition();

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
    <SummaryCard
      title="Latency by tier"
      info="Where wall-clock time goes, split by execution tier — LLM generation, Retrieval/DB, Tool, and Orchestration. Each tier's share = its summed span duration ÷ total duration across all tiers. Each segment's 'p95' sublabel is that tier's own 95th-percentile span time. The caption's Fleet P95 is the overall end-to-end 95th-percentile latency from the summary."
      subtitle="share of wall-clock time"
      drill={{ label: "Agents", to: "/agents" }}
    >
      {isLoading && segs.length === 0 ? (
        <Skeleton style={{ height: 130, borderRadius: 8 }} />
      ) : error ? (
        <ErrorState bare error={error} />
      ) : segs.length === 0 ? (
        <EmptyState
          bare
          title="No latency spans in scope"
          description="No spans carried a per-tier duration for this timeframe and scope."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Lead with the tier mix — the fleet P95 headline already lives in
              the hero KPIs, so here it's a small caption, not a duplicate big
              number (SUM-1). */}
          <StackedBar segments={segs} height={16} />
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            Fleet P95 {fmtMs(summary.p95Ms)} · share of wall-clock by tier
          </span>
        </div>
      )}
    </SummaryCard>
  );
};
