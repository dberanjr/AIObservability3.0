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
import { ScanScopedTile } from "../../scope/ScanScopedTile";
import { useUpstreamServices } from "../Agents/useUpstreamServices";
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
  const upstream = useUpstreamServices();

  // AI service names for the A/B "service being compared" dropdown.
  const serviceNames = useMemo(
    () => finOps.services.map((s) => s.service),
    [finOps.services],
  );
  // Real upstream caller services (Smartscape topology) for the A/B "driving
  // upstream" dropdown.
  const upstreamOptions = useMemo(
    () => upstream.rows.map((r) => r.upstream),
    [upstream.rows],
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
          <ScanScopedTile name="Prompt cache & cost">
            <CacheCostPanel />
          </ScanScopedTile>
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
        <ScanScopedTile name="Model A/B comparison">
          <ModelComparisonPanel
            services={serviceNames}
            upstreamOptions={upstreamOptions}
          />
        </ScanScopedTile>
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
        <ScanScopedTile name="Session & user cost">
          <SessionUserCostPanel />
        </ScanScopedTile>
      </CollapsibleSection>
    </Flex>
  );
};
