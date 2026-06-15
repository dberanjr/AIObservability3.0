import React, { useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { FindingCard } from "../../components/FindingCard";
import {
  DEFAULT_FINDING_INTENTS,
  type Finding,
} from "../../components/drawers/types";
import { fmtPercent, fmtUSD, fmtUSDCompact } from "../../data/format";
import type { ModelRow } from "./useModels";
import type { FinOpsData } from "./useFinOps";

export interface FinOpsFindingsProps {
  data: FinOpsData;
  models: ModelRow[];
  onSelect: (finding: Finding) => void;
}

export const FinOpsFindings = ({
  data,
  models,
  onSelect,
}: FinOpsFindingsProps) => {
  const findings = useMemo<Finding[]>(() => {
    const out: Finding[] = [];

    // Cost spike — compare last day vs the previous-6-day average.
    const totals = data.daily.totals;
    if (totals.length >= 2) {
      const latest = totals[totals.length - 1];
      const prior = totals.slice(0, -1);
      const avgPrior =
        prior.length > 0
          ? prior.reduce((acc, v) => acc + v, 0) / prior.length
          : 0;
      if (avgPrior > 0 && latest > avgPrior * 1.5) {
        out.push({
          id: "cost-spike",
          severity: latest > avgPrior * 3 ? "critical" : "warning",
          category: "Cost spike",
          entity: data.daily.dayLabels[data.daily.dayLabels.length - 1] ?? "today",
          metric: fmtUSDCompact(latest),
          context: `Daily spend is ${(latest / avgPrior).toFixed(1)}× the prior 6-day average (${fmtUSDCompact(avgPrior)}/day).`,
          intents: DEFAULT_FINDING_INTENTS,
        });
      }
    }

    // Downgrade win — most-expensive priced model ≥ 3× cheapest peer.
    const priced = models.filter(
      (m) => !m.pricingUnknown && m.costPerMTok > 0,
    );
    if (priced.length >= 2) {
      const expensive = priced.reduce((best, m) =>
        m.costPerMTok > best.costPerMTok ? m : best,
      );
      const cheap = priced.reduce((best, m) =>
        m.costPerMTok < best.costPerMTok ? m : best,
      );
      if (
        expensive.modelKey !== cheap.modelKey &&
        expensive.costPerMTok > cheap.costPerMTok * 3
      ) {
        const ratio = expensive.costPerMTok / cheap.costPerMTok;
        out.push({
          id: "downgrade-win",
          severity: "info",
          category: "Downgrade win",
          entity: expensive.model,
          metric: fmtUSD(expensive.costPerMTok),
          context: `${expensive.model} runs ${ratio.toFixed(1)}× the $/1M of ${cheap.model}. Pilot a tier swap on lower-stakes prompts.`,
          intents: DEFAULT_FINDING_INTENTS,
        });
      }
    }

    // Cache opportunity — proxied by repeated high-volume short prompts.
    // True repeats need prompt-hash; here we surface services running >100k
    // requests with sub-2k avg input tokens as candidates.
    const cacheCandidate = data.services
      .filter((s) => s.tokens > 100_000)
      .find((s) => s.cost > 0);
    if (cacheCandidate) {
      out.push({
        id: "cache-opportunity",
        severity: "info",
        category: "Cache opportunity",
        entity: cacheCandidate.service,
        metric: fmtUSDCompact(cacheCandidate.cost),
        context: `High-volume traffic on ${cacheCandidate.topModel ?? "model unknown"} — prompt-hash cache likely pays back quickly. Needs span-level repeat detection (Session 14 polish).`,
        intents: DEFAULT_FINDING_INTENTS,
      });
    }

    // Bedrock markup — any models served via Bedrock.
    const bedrockModels = models.filter((m) => m.provider.viaBedrock);
    if (bedrockModels.length > 0) {
      const bedrockCost = bedrockModels.reduce((acc, m) => acc + m.cost, 0);
      out.push({
        id: "bedrock-markup",
        severity: "info",
        category: "Bedrock markup",
        entity: `${bedrockModels.length} models via Bedrock`,
        metric: fmtUSDCompact(bedrockCost),
        context:
          "Models proxied through AWS Bedrock typically carry a markup. Compare to direct vendor pricing before contract renewal.",
        intents: DEFAULT_FINDING_INTENTS,
      });
    }

    // Concentration callout.
    if (data.concentrationPct > 60) {
      const top = data.services[0];
      if (top) {
        out.push({
          id: "concentration",
          severity: "warning",
          category: "Concentration",
          entity: top.service,
          metric: fmtPercent(data.concentrationPct, 0),
          context: `${top.service} accounts for ${fmtPercent(data.concentrationPct, 0)} of fleet spend. One workload tuning yields outsized savings here.`,
          intents: DEFAULT_FINDING_INTENTS,
        });
      }
    }

    return out.slice(0, 4);
  }, [data, models]);

  if (findings.length === 0) {
    return (
      <Flex style={{ padding: "4px 4px" }}>
        <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
          No FinOps findings surfaced in the current scope.
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
