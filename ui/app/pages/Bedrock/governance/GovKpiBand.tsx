import React, { useState } from "react";
import { StatTile } from "../../../components/StatTile";
import { fmtCount } from "../../../data/format";
import type { GovScope } from "../../../bedrock/governance/types";
import { useGovKpis } from "../../../bedrock/governance/useGovernance";
import { GovTileModal, type GovTileKind } from "./GovTileModal";

export interface GovKpiBandProps {
  scope: GovScope;
}

const GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "var(--d-gap, 16px)",
};

/**
 * Access & Governance headline counters (D-band): six StatTiles reading the
 * single `useGovKpis` summarize. Every tile is clickable (like the Runtime
 * tab's KPI row) and opens a wide detail modal — the Cross-region tile opens the
 * data-residency / exfiltration deep-dive. Denials warn when non-zero; Non-MFA
 * carries an honest tooltip (CloudTrail leaves MFA null/false on programmatic
 * IAM-role sessions, so a high count is expected for service access).
 */
export const GovKpiBand = ({ scope }: GovKpiBandProps) => {
  const { kpis, isLoading } = useGovKpis(scope);
  const [modal, setModal] = useState<GovTileKind | null>(null);
  const initial = isLoading && kpis.totalCalls === 0;

  return (
    <>
      <div style={GRID}>
        <StatTile
          label="API calls"
          value={fmtCount(kpis.totalCalls)}
          info="Total Bedrock API calls recorded in CloudTrail (eventSource bedrock.amazonaws.com) in scope — control-plane and data-plane events. Not additive with cost; this view never sums tokens or spend."
          loading={initial}
          onClick={() => setModal("calls")}
          actionLabel="Open API calls details"
        />
        <StatTile
          label="Identities"
          value={fmtCount(kpis.distinctIdentities)}
          info="Distinct IAM identities (last ARN path segment — role session or user name) calling Bedrock in scope."
          loading={initial}
          onClick={() => setModal("identities")}
          actionLabel="Open Identities details"
        />
        <StatTile
          label="Source IPs"
          value={fmtCount(kpis.distinctSourceIps)}
          info="Distinct source IP addresses Bedrock was called from. A single identity spread across many IPs can indicate shared credentials — see the Anomalous Access card."
          loading={initial}
          onClick={() => setModal("sourceIps")}
          actionLabel="Open Source IPs details"
        />
        <StatTile
          label="Errored / denied"
          value={fmtCount(kpis.erroredCalls)}
          tone={kpis.erroredCalls > 0 ? "warn" : "good"}
          cue
          info="Calls returning an error code (e.g. AccessDenied, ValidationException). AccessDenied can be an intentional policy/SCP denial (good governance) or a broken pipeline — the modal separates them."
          loading={initial}
          onClick={() => setModal("errored")}
          actionLabel="Open Errored / denied details"
        />
        <StatTile
          label="Non-MFA calls"
          value={fmtCount(kpis.nonMfaCalls)}
          info="Calls whose session had mfaAuthenticated=false. Programmatic access via IAM roles carries no MFA, so a high count is expected for service workloads — treat human/console identities without MFA as the real flag."
          loading={initial}
          onClick={() => setModal("nonMfa")}
          actionLabel="Open Non-MFA details"
        />
        <StatTile
          label="Cross-region"
          value={fmtCount(kpis.crossRegionCalls)}
          tone={kpis.crossRegionCalls > 0 ? "warn" : "neutral"}
          info="Calls whose inference ran in a different region than requested (cross-region inference). Same-country routing is normal; inference leaving the country is a residency flag — click for the data-residency deep-dive."
          loading={initial}
          onClick={() => setModal("crossRegion")}
          actionLabel="Open Cross-region data-residency deep-dive"
        />
      </div>

      {modal && <GovTileModal kind={modal} scope={scope} onClose={() => setModal(null)} />}
    </>
  );
};
