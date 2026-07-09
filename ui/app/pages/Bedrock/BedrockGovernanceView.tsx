import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { fmtCount } from "../../data/format";
import type { GovScope } from "../../bedrock/governance/types";
import { useGovKpis } from "../../bedrock/governance/useGovernance";
import { GovKpiBand } from "./governance/GovKpiBand";
import { GovAccessDeniedCard } from "./governance/GovAccessDeniedCard";
import { GovAnomalousAccessCard } from "./governance/GovAnomalousAccessCard";
import { GovDataResidencyCard } from "./governance/GovDataResidencyCard";
import { GovThrottlingCard } from "./governance/GovThrottlingCard";
import { GovActivityDetail } from "./governance/GovActivityDetail";
import { GovSecurityDetail } from "./governance/GovSecurityDetail";
import { GovReconciliation } from "./governance/GovReconciliation";

export interface BedrockGovernanceViewProps {
  scope: GovScope;
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

const SectionHeader = ({ eyebrow, title }: { eyebrow: string; title: string }) => (
  <Flex flexDirection="column" gap={4} style={{ marginTop: 4 }}>
    <Text style={SECTION_LABEL}>{eyebrow}</Text>
    <Heading level={2} style={{ fontSize: 15, fontWeight: 600 }}>
      {title}
    </Heading>
  </Flex>
);

/**
 * Access & Governance sub-tab — 100% CloudTrail. Reorganised from the source
 * dashboard's tile grid into a problem-solving narrative: headline counters →
 * purpose-built insight cards (the four themes: security, reliability,
 * residency) → activity/identity detail → security-over-time → a reconciliation
 * bridge that proves the CloudTrail and ModelInvocationLog sources agree.
 */
export const BedrockGovernanceView = ({ scope }: BedrockGovernanceViewProps) => {
  const { kpis } = useGovKpis(scope);
  return (
    <Flex flexDirection="column" gap={16}>
      <Text style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.4 }}>
        {fmtCount(kpis.totalCalls)} API calls · {fmtCount(kpis.distinctIdentities)} identities ·{" "}
        {fmtCount(kpis.distinctSourceIps)} source IPs · {fmtCount(kpis.distinctAccounts)} accounts ·
        source: CloudTrail (bedrock.amazonaws.com)
      </Text>

      <GovKpiBand scope={scope} />

      <SectionHeader eyebrow="Problem patterns" title="Security, quota & residency signals" />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: "var(--d-gap, 16px)",
        }}
      >
        <GovAnomalousAccessCard scope={scope} />
        <GovAccessDeniedCard scope={scope} />
        <GovDataResidencyCard scope={scope} />
        <GovThrottlingCard scope={scope} />
      </div>

      <SectionHeader eyebrow="Activity & identity" title="Who is calling Bedrock, and how" />
      <GovActivityDetail scope={scope} />

      <SectionHeader eyebrow="Security & compliance" title="Errors, denials & control-plane changes" />
      <GovSecurityDetail scope={scope} />

      <SectionHeader eyebrow="Reconciliation" title="CloudTrail vs metering — logging coverage" />
      <GovReconciliation scope={scope} />
    </Flex>
  );
};
