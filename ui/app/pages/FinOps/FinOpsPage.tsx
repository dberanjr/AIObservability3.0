import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { ErrorBanner } from "../../components/ErrorState";
import { FindingDrawer } from "../../components/drawers/FindingDrawer";
import type { Finding } from "../../components/drawers/types";
import { CostConcentrationTreemap } from "./CostConcentrationTreemap";
import { CostEfficiencyByService } from "./CostEfficiencyByService";
import { DailyCostStackedBar } from "./DailyCostStackedBar";
import { FinOpsFindings } from "./FinOpsFindings";
import { FinOpsTilesRow } from "./FinOpsTilesRow";
import { CacheCostPanel } from "./CacheCostPanel";
import { CapabilityGate } from "../../components/CapabilityGate";
import { ModelComparisonPanel } from "./ModelComparisonPanel";
import { useFinOps } from "./useFinOps";
import { useModels } from "../Models/useModels";

export const FinOpsPage = () => {
  const finOps = useFinOps();
  const { models } = useModels();
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);

  // Rough monthly request estimate for projected-savings math: extrapolate
  // the 7d daily average across 30 days.
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
    <>
      <Flex
        flexDirection="column"
        gap={16}
        style={{ padding: "18px 20px 80px" }}
      >
        {finOps.error && <ErrorBanner error={finOps.error} />}
        <FinOpsTilesRow data={finOps} />
        <CapabilityGate id={["cacheTokens", "cacheWriteTokens", "sdkCost"]}>
          <CacheCostPanel />
        </CapabilityGate>
        <FinOpsFindings
          data={finOps}
          models={models}
          onSelect={setSelectedFinding}
        />
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
        <ModelComparisonPanel
          models={models}
          observedUpstream={observedUpstream}
          monthlyRequests={monthlyRequests}
        />
        <CostEfficiencyByService
          services={finOps.services}
          isLoading={finOps.isLoading}
        />
      </Flex>
      <FindingDrawer
        finding={selectedFinding}
        onDismiss={() => setSelectedFinding(null)}
      />
    </>
  );
};
