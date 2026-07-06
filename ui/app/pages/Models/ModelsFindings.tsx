import React, { useMemo } from "react";
import { FindingCard } from "../../components/FindingCard";
import { EmptyState } from "../../components/EmptyState";
import { DEFAULT_FINDING_INTENTS, type Finding } from "../../components/drawers/types";
import { fmtCount } from "../../data/format";
import type { ModelRow } from "./useModels";

export interface ModelsFindingsProps {
  models: ModelRow[];
  onSelect: (finding: Finding) => void;
}

export const ModelsFindings = ({ models, onSelect }: ModelsFindingsProps) => {
  const findings = useMemo<Finding[]>(() => {
    if (models.length === 0) return [];
    const out: Finding[] = [];

    const providerShares = new Map<string, number>();
    let totalRequests = 0;
    for (const m of models) {
      providerShares.set(
        m.provider.id,
        (providerShares.get(m.provider.id) ?? 0) + m.requests,
      );
      totalRequests += m.requests;
    }
    const [topProvider, topProviderRequests] =
      Array.from(providerShares.entries()).sort((a, b) => b[1] - a[1])[0] ?? [
        "",
        0,
      ];
    const sharePct =
      totalRequests > 0 ? (topProviderRequests / totalRequests) * 100 : 0;
    if (sharePct > 80) {
      const providerModels = models
        .filter((m) => m.provider.id === topProvider)
        .map((m) => m.model);
      out.push({
        id: "single-vendor-risk",
        severity: "warning",
        category: "Single-vendor risk",
        entity: topProvider,
        metric: `${sharePct.toFixed(0)}% of requests`,
        context:
          "More than 80% of model requests route to one provider. Diversify to reduce blast radius if that vendor degrades.",
        intents: DEFAULT_FINDING_INTENTS,
        promptsFilter: { models: providerModels },
      });
    }

    // Downgrade-candidate and Bedrock-markup findings live in the FinOps
    // findings row (they are cost/spend insights). Keeping them here too showed
    // the same insight twice on one scroll — this block now focuses on
    // model-mix risks (single-vendor concentration, Opus under-use).

    const opus = models.find((m) => /opus/i.test(m.model));
    if (opus && opus.requests > 0) {
      const opusShare =
        totalRequests > 0 ? (opus.requests / totalRequests) * 100 : 0;
      if (opusShare < 5) {
        out.push({
          id: "opus-underused",
          severity: "info",
          category: "Opus underused",
          entity: opus.model,
          metric: `${opusShare.toFixed(1)}% of requests`,
          context: `${opus.model} is provisioned but handles less than 5% of traffic (${fmtCount(opus.requests)} req). Consider routing harder prompts to it or downgrading the contract.`,
          intents: DEFAULT_FINDING_INTENTS,
          promptsFilter: { models: [opus.model] },
        });
      }
    }

    return out.slice(0, 4);
  }, [models]);

  if (findings.length === 0) {
    return (
      <EmptyState
        bare
        cause="no-activity"
        title="No model findings surfaced in the current scope."
      />
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
        <FindingCard key={f.id} finding={f} onClick={onSelect} />
      ))}
    </div>
  );
};
