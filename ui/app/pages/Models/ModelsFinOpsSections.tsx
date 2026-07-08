/**
 * FinOps surfaces, merged into the Models / FinOps tab as collapsible sections
 * below the model bubble chart and table (redesign F). Every cost figure flows
 * through the section-G cache-aware cost model. Findings route to the page's
 * shared FindingDrawer via onSelect.
 */
import React, { useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import type { Finding } from "../../components/drawers/types";
import { CollapsibleSection } from "../../components/CollapsibleSection";
import { MODEL_TYPE_LABEL } from "./useModels";
import type { ModelTypeFilter } from "./ModelTypeSegmented";
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
  /** The page's active model-type filter, for the scope-mismatch caption. */
  typeFilter?: ModelTypeFilter;
  onSelectFinding: (f: Finding) => void;
}

export const ModelsFinOpsSections = ({
  models,
  typeFilter = "all",
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
        subtitle="24h · 7d · projected 30d · fleet · all model types"
        defaultOpen
      >
        <Flex flexDirection="column" gap={16}>
          {typeFilter !== "all" && (
            <Text
              style={{
                fontSize: 11.5,
                color: "var(--text-3)",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "6px 10px",
              }}
            >
              Showing fleet spend across <strong>all model types</strong>. The
              &ldquo;{MODEL_TYPE_LABEL[typeFilter]}&rdquo; filter above applies to
              the model inventory only, not to these cost rollups.
            </Text>
          )}
          <FinOpsTilesRow data={finOps} />
          <FinOpsFindings
            data={finOps}
            models={models}
            onSelect={onSelectFinding}
          />
        </Flex>
      </CollapsibleSection>

      <CapabilityGate
        id={["cacheTokens", "cacheWriteTokens", "sdkCost"]}
        label="Prompt cache & reported cost — available with instrumentation"
        hint={
          <>
            Emit <code>gen_ai.usage.cached_tokens</code>,{" "}
            <code>cache_creation_input_tokens</code>, or{" "}
            <code>gen_ai.usage.cost</code> to surface prompt-cache hit rate and
            provider-reported spend here.
          </>
        }
      >
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
