import React, { useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { FindingCard } from "../../components/FindingCard";
import { DEFAULT_FINDING_INTENTS, type Finding } from "../../components/drawers/types";
import { fmtCount, fmtUSD } from "../../data/format";
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
      out.push({
        id: "single-vendor-risk",
        severity: "warning",
        category: "Single-vendor risk",
        entity: topProvider,
        metric: `${sharePct.toFixed(0)}% of requests`,
        context:
          "More than 80% of model requests route to one provider. Diversify to reduce blast radius if that vendor degrades.",
        intents: DEFAULT_FINDING_INTENTS,
      });
    }

    const expensiveModel = [...models]
      .filter((m) => !m.pricingUnknown && m.costPerMTok > 0)
      .sort((a, b) => b.costPerMTok - a.costPerMTok)[0];
    const cheapPeer = [...models]
      .filter((m) => !m.pricingUnknown && m.costPerMTok > 0)
      .sort((a, b) => a.costPerMTok - b.costPerMTok)[0];
    if (
      expensiveModel &&
      cheapPeer &&
      expensiveModel.modelKey !== cheapPeer.modelKey &&
      expensiveModel.costPerMTok > cheapPeer.costPerMTok * 3
    ) {
      out.push({
        id: "downgrade-candidate",
        severity: "info",
        category: "Downgrade candidate",
        entity: expensiveModel.model,
        metric: fmtUSD(expensiveModel.costPerMTok),
        context: `${expensiveModel.model} costs ${(expensiveModel.costPerMTok / cheapPeer.costPerMTok).toFixed(1)}× ${cheapPeer.model}. Pilot ${cheapPeer.model} on lower-stakes prompts and compare quality.`,
        intents: DEFAULT_FINDING_INTENTS,
      });
    }

    const bedrockModels = models.filter((m) => m.provider.viaBedrock);
    if (bedrockModels.length > 0) {
      const totalCost = bedrockModels.reduce((acc, m) => acc + m.cost, 0);
      out.push({
        id: "bedrock-proxy-markup",
        severity: "info",
        category: "Bedrock proxy markup",
        entity: `${bedrockModels.length} models via Bedrock`,
        metric: fmtUSD(totalCost),
        context:
          "Anthropic / Cohere / Mistral served via AWS Bedrock typically carry a proxy markup. Compare to direct vendor pricing when sizing the FinOps story.",
        intents: DEFAULT_FINDING_INTENTS,
      });
    }

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
        });
      }
    }

    return out.slice(0, 4);
  }, [models]);

  if (findings.length === 0) {
    return (
      <Flex style={{ padding: "4px 4px" }}>
        <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
          No model findings surfaced in the current scope.
        </Text>
      </Flex>
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
