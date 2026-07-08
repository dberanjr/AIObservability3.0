import React, { useMemo } from "react";
import { Skeleton } from "@dynatrace/strato-components/content";
import { FindingCard } from "../../components/FindingCard";
import type { Finding, FindingSeverity } from "../../components/drawers/types";
import { useBedrockCost, useBedrockPerf } from "../../bedrock/useBedrock";
import type { BedrockScope } from "../../bedrock/types";
import { computeInsights, buildInsightsInput, type Insight } from "./insights";

export interface BedrockFindingsProps {
  scope: BedrockScope;
}

/** FindingSeverity has no positive tier — a savings win (tone "good") reads
 *  as "info" here, not a "warning"/"critical" problem to fix. */
const TONE_SEVERITY: Record<Insight["tone"], FindingSeverity> = {
  warn: "warning",
  info: "info",
  good: "info",
};

/**
 * Always-present, non-computed finding: an honest statement of what this
 * tenant's Bedrock logs DON'T carry, so the coverage gap reads as a fixed
 * fact rather than something that could silently disappear once traffic
 * picks up (unlike the threshold-guarded insight cards, which come and go).
 */
const COVERAGE_GAP: Finding = {
  id: "bedrock-coverage-gap",
  severity: "info",
  category: "Coverage gap",
  entity: "Model I/O logging",
  metric: "Not enabled",
  context:
    "No prompt/response content or tool/agent topology in these logs — enable Bedrock model input/output data logging (and Bedrock error/throttle metrics) to unlock Prompts, Agent-tool, and error-rate views.",
};

/**
 * Findings strip (D6): renders the same `computeInsights` sentences
 * BedrockHero shows inline (cost concentration, latency outlier, cache
 * savings — via the shared `buildInsightsInput` helper, see insights.ts) as
 * FindingCards, plus the always-present coverage-gap card. Unlike
 * ModelsFindings/FinOpsFindings this strip has no click-through drawer: none
 * of these findings map to the FindingDrawer's entity-type switch (service /
 * agent / model-in-Prompts-filter) the way Explorer/Models findings do, so a
 * wired click would either no-op or open a misleading drill-down.
 */
export const BedrockFindings = ({ scope }: BedrockFindingsProps) => {
  const { daily, summary, isLoading: costLoading } = useBedrockCost(scope);
  const { rows: perfRows, isLoading: perfLoading } = useBedrockPerf(scope);

  const findings = useMemo<Finding[]>(() => {
    const insights = computeInsights(buildInsightsInput({ daily, summary, perfRows }));
    const insightFindings: Finding[] = insights.map((insight) => ({
      id: `bedrock-insight-${insight.category}`,
      severity: TONE_SEVERITY[insight.tone],
      category: insight.category,
      entity: insight.entity,
      metric: insight.metric,
      context: insight.text,
    }));
    return [...insightFindings, COVERAGE_GAP];
  }, [daily, summary, perfRows]);

  // Skeletons only before either source hook's FIRST successful load (not on
  // every scope refetch) — mirrors BedrockHero/BedrockKpiRow's guard. The
  // coverage-gap card doesn't depend on either hook, so it's fine to delay it
  // behind the same loading gate rather than flash it in alone.
  const initialLoading = (costLoading && daily.length === 0) || (perfLoading && perfRows.length === 0);

  if (initialLoading) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} style={{ height: 120, borderRadius: 10 }} />
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(findings.length, 4)}, minmax(0, 1fr))`,
        gap: 12,
      }}
    >
      {findings.map((f) => (
        <FindingCard key={f.id} finding={f} />
      ))}
    </div>
  );
};
