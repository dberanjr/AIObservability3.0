import React, { useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { ErrorBanner } from "../../components/ErrorState";
import { FindingDrawer } from "../../components/drawers/FindingDrawer";
import type { Finding } from "../../components/drawers/types";
import { useModels } from "../Models/useModels";
import { ActivityHistogramPanel } from "./ActivityHistogramPanel";
import { AgentCostBarList } from "./AgentCostBarList";
import { AnomalyPanel } from "./AnomalyPanel";
import { PlatformHealthCard } from "./PlatformHealthCard";
import { ProviderMixDonut } from "./ProviderMixDonut";
import { SummaryTilesRow } from "./SummaryTilesRow";
import { TokenConsumptionChart } from "./TokenConsumptionChart";
import { TopFindingsStrip } from "./TopFindingsStrip";
import { TopModelsPanel } from "./TopModelsPanel";
import { useActivityHistogram } from "./useActivityHistogram";
import { useAgentCosts } from "./useAgentCosts";
import { useAnomalies } from "./anomalies/useAnomalies";
import { useProviderMix } from "./useProviderMix";
import { usePulseHealth } from "./usePulseHealth";
import { usePulseSummary } from "./usePulseSummary";
import { useTokenConsumption } from "./useTokenConsumption";

export const PulsePage = () => {
  const health = usePulseHealth();
  const summary = usePulseSummary();
  const agentCosts = useAgentCosts();
  const tokenSeries = useTokenConsumption();
  const histogram = useActivityHistogram();
  const providerMix = useProviderMix();
  const { anomalies, isLoading: anomaliesLoading, error: anomaliesError } =
    useAnomalies();
  const { models, isLoading: modelsLoading } = useModels();
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);

  // Page-level error surface — collapses partial data only when the first
  // panel hook itself can't load. Other panels still render whatever they have.
  const firstError =
    health.error ??
    summary.error ??
    anomaliesError ??
    tokenSeries.error ??
    histogram.error ??
    providerMix.error ??
    agentCosts.error ??
    null;

  return (
    <>
      <Flex
        flexDirection="column"
        gap={16}
        style={{ padding: "18px 20px 80px" }}
      >
        {firstError && <ErrorBanner error={firstError} />}
        <SummaryTilesRow summary={summary} />
        <AnomalyPanel
          anomalies={anomalies}
          isLoading={anomaliesLoading}
          onSelect={setSelectedFinding}
        />
        <TopFindingsStrip
          findings={anomalies}
          isLoading={anomaliesLoading}
          onSelect={setSelectedFinding}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
            gap: 16,
          }}
        >
          <TokenConsumptionChart result={tokenSeries} />
          <ActivityHistogramPanel result={histogram} />
        </div>
        <PlatformHealthCard health={health} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)",
            gap: 16,
            alignItems: "start",
          }}
        >
          <AgentCostBarList result={agentCosts} />
          <TopModelsPanel models={models} isLoading={modelsLoading} />
          <ProviderMixDonut result={providerMix} />
        </div>
      </Flex>
      <FindingDrawer
        finding={selectedFinding}
        onDismiss={() => setSelectedFinding(null)}
      />
    </>
  );
};
