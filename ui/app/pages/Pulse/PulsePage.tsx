import React, { useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { ErrorBanner } from "../../components/ErrorState";
import { DataGapNote } from "../../components/DataGapNote";
import { FindingDrawer } from "../../components/drawers/FindingDrawer";
import type { Finding } from "../../components/drawers/types";
import { LatencyTierPanel } from "../Agents/LatencyTierPanel";
import { ArchitectureMap } from "./ArchitectureMap";
import { SpendGlance } from "./SpendGlance";
import { ActivityHistogramPanel } from "./ActivityHistogramPanel";
import { AgentCostBarList } from "./AgentCostBarList";
import { PlatformHealthCard } from "./PlatformHealthCard";
import { ProviderMixDonut } from "./ProviderMixDonut";
import { SummaryTilesRow } from "./SummaryTilesRow";
import { SafetyPanel } from "./SafetyPanel";
import { FeedbackPanel } from "./FeedbackPanel";
import { CapabilityGate } from "../../components/CapabilityGate";
import { TokenEfficiencyTiles } from "./TokenEfficiencyTiles";
import { TokenConsumptionChart } from "./TokenConsumptionChart";
import { TopFindingsStrip } from "./TopFindingsStrip";
import { TopModelsCard } from "./TopModelsPanel";
import { usePulseSummary } from "./usePulseSummary";

export const PulsePage = () => {
  const summary = usePulseSummary();
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);

  // Page-level error surface — only the always-mounted hero summary hook is
  // hoisted here; every collapsible section owns (and surfaces) its own load
  // state inside its body, so a collapsed section issues no query at all.
  const firstError = summary.error ?? null;

  return (
    <>
      <Flex
        flexDirection="column"
        gap={24}
        style={{ padding: "18px 20px 80px" }}
      >
        {firstError && <ErrorBanner error={firstError} />}
        {/* Hero: the architecture map (priority) with the summary tiles in a
            two-column side panel. The tiles drop below the map when the
            viewport narrows (see .aiobs-pulse-hero). */}
        <div className="aiobs-pulse-hero">
          <ArchitectureMap />
          <SummaryTilesRow summary={summary} initialColumns={2} />
        </div>
        <DataGapNote
          message="Error rate now includes logical failures (refusals / content-filter), not just HTTP/exception errors. Quality scoring and TTFT are still unavailable — no evaluation scores or time-to-first-token attributes are emitted — and spend per session/user can't be computed without identity + proxy trace propagation."
          attributes={["gen_ai.evaluation.score", "gen_ai.usage.time_to_first_token", "session.id", "gen_ai.user"]}
          bestPractice="Emit evaluation scores (P1.2), a TTFT attribute (P1.5), session/user identity (P1.1), and propagate trace context across the LLM proxy (P0.1). See INSTRUMENTATION-REQUIREMENTS.md."
          href="https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/"
          hrefLabel="OTel GenAI"
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
            gap: 16,
          }}
        >
          <TokenConsumptionChart />
          <ActivityHistogramPanel />
        </div>
        <SpendGlance />
        <TokenEfficiencyTiles />
        <LatencyTierPanel />
        <TopFindingsStrip onSelect={setSelectedFinding} />
        <PlatformHealthCard />
        <CapabilityGate id={["guardrails", "piiCategories"]}>
          <SafetyPanel />
        </CapabilityGate>
        <CapabilityGate id={["feedback", "promptVersion"]}>
          <FeedbackPanel />
        </CapabilityGate>
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)",
            gap: 16,
            alignItems: "start",
          }}
        >
          <AgentCostBarList />
          <TopModelsCard />
          <ProviderMixDonut />
        </div>
      </Flex>
      <FindingDrawer
        finding={selectedFinding}
        onDismiss={() => setSelectedFinding(null)}
      />
    </>
  );
};
