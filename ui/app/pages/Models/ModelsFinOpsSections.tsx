/**
 * FinOps surfaces, merged into the Models / FinOps tab as collapsible sections
 * below the model bubble chart and table (redesign F). Every cost figure flows
 * through the section-G cache-aware cost model. Findings route to the page's
 * shared FindingDrawer via onSelect.
 */
import React, { useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import type { Finding } from "../../components/drawers/types";
import { CollapsibleSection } from "../../components/CollapsibleSection";
import { CapabilityGate } from "../../components/CapabilityGate";
import type { ModelRow } from "./useModels";
import { useFinOps } from "./useFinOps";
import { FinOpsTilesRow } from "./FinOpsTilesRow";
import { CacheCostPanel } from "./CacheCostPanel";
import { FinOpsFindings } from "./FinOpsFindings";
import { DailyCostStackedBar } from "./DailyCostStackedBar";
import { CostConcentrationTreemap } from "./CostConcentrationTreemap";
import { ModelComparisonPanel } from "./ModelComparisonPanel";
import { CostEfficiencyByService } from "./CostEfficiencyByService";
import { SessionUserCostPanel } from "./SessionUserCostPanel";

export interface ModelsFinOpsSectionsProps {
  models: ModelRow[];
  onSelectFinding: (f: Finding) => void;
}

export const ModelsFinOpsSections = ({
  models,
  onSelectFinding,
}: ModelsFinOpsSectionsProps) => {
  const finOps = useFinOps();

  const monthlyRequests = useMemo(() => {
    const fleetRequests = models.reduce((acc, m) => acc + m.requests, 0);
    if (fleetRequests === 0) return 0;
    return Math.round(fleetRequests * (30 / 7));
  }, [models]);

  const observedUpstream = useMemo(
    () => finOps.services.slice(0, 6).map((s) => s.service),
    [finOps.services],
  );

  return (
    <Flex flexDirection="column" gap={12}>
      <CollapsibleSection
        title="Cost & spend overview"
        subtitle="24h · 7d · projected 30d"
        defaultOpen
      >
        <Flex flexDirection="column" gap={16}>
          <FinOpsTilesRow data={finOps} />
          <FinOpsFindings
            data={finOps}
            models={models}
            onSelect={onSelectFinding}
          />
        </Flex>
      </CollapsibleSection>

      <CapabilityGate id={["cacheTokens", "cacheWriteTokens", "sdkCost"]}>
        <CollapsibleSection
          title="Prompt cache & reported cost"
          subtitle="auto-detected"
        >
          <CacheCostPanel />
        </CollapsibleSection>
      </CapabilityGate>

      <CollapsibleSection title="Daily cost & concentration">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
            gap: 16,
          }}
        >
          <DailyCostStackedBar
            daily={finOps.daily}
            isLoading={finOps.isLoading}
          />
          <CostConcentrationTreemap
            services={finOps.services}
            isLoading={finOps.isLoading}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Model A/B swap comparison">
        <ModelComparisonPanel
          models={models}
          observedUpstream={observedUpstream}
          monthlyRequests={monthlyRequests}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Cost efficiency by service">
        <CostEfficiencyByService
          services={finOps.services}
          isLoading={finOps.isLoading}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Session & user cost"
        subtitle="multi-turn spend per session / user"
      >
        <SessionUserCostPanel />
      </CollapsibleSection>
    </Flex>
  );
};
