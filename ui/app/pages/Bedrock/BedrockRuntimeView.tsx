import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { fmtCount } from "../../data/format";
import type { BedrockScope } from "../../bedrock/types";
import { useBedrockOverview } from "../../bedrock/useBedrock";
import { BedrockHero } from "./BedrockHero";
import { BedrockKpiRow } from "./BedrockKpiRow";
import { BedrockCostZone } from "./BedrockCostZone";
import { AgentSessionTable } from "./AgentSessionTable";
import { BedrockPerfZone } from "./BedrockPerfZone";
import { BedrockQuotaDelivery } from "./BedrockQuotaDelivery";
import { BedrockLatencyTrends } from "./BedrockLatencyTrends";
import { BedrockPerModelSummary } from "./BedrockPerModelSummary";
import { BedrockGuardrailsSummary } from "./BedrockGuardrailsSummary";
import { BedrockFindings } from "./BedrockFindings";

export interface BedrockRuntimeViewProps {
  scope: BedrockScope;
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

/**
 * Runtime Observability & Cost & Usage sub-tab. Today's Bedrock page (Hero,
 * KPIs, cost, agent sessions, performance, guardrails, findings) extracted
 * intact, plus the Runtime 2.0 section: per-model TPM quota pressure +
 * log-delivery health, latency/TTFT min·avg·max trend bands, and a per-model
 * summary table (the three metric families the original page lacked).
 */
export const BedrockRuntimeView = ({ scope }: BedrockRuntimeViewProps) => {
  const { totals } = useBedrockOverview(scope);
  return (
    <Flex flexDirection="column" gap={16}>
      <Text style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.4 }}>
        {fmtCount(totals.invocations)} invocations ·{" "}
        {fmtCount(totals.accounts)} accounts · {fmtCount(totals.models)} models ·{" "}
        {fmtCount(totals.sessions)} sessions · source: Logs + Metrics
      </Text>

      <BedrockHero scope={scope} />
      <BedrockKpiRow scope={scope} />
      <BedrockCostZone scope={scope} />
      <AgentSessionTable scope={scope} />
      <BedrockPerfZone scope={scope} />

      <Flex flexDirection="column" gap={4} style={{ marginTop: 4 }}>
        <Text style={SECTION_LABEL}>Quota, delivery & latency (Runtime 2.0)</Text>
        <Heading level={2} style={{ fontSize: 15, fontWeight: 600 }}>
          Throughput headroom & response health
        </Heading>
      </Flex>
      <BedrockQuotaDelivery scope={scope} />
      <BedrockLatencyTrends scope={scope} />
      <BedrockPerModelSummary scope={scope} />

      <BedrockGuardrailsSummary />
      <BedrockFindings scope={scope} />
    </Flex>
  );
};
