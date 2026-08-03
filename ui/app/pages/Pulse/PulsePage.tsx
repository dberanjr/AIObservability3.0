import React, { useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { ErrorBanner } from "../../components/ErrorState";
import { PageIntro } from "../../components/PageIntro";
import { CollapsibleDataGapNote } from "../../components/CollapsibleDataGapNote";
import { ExampleDataNotice } from "../../components/ExampleDataNotice";
import { FindingDrawer } from "../../components/drawers/FindingDrawer";
import type { Finding } from "../../components/drawers/types";
import { useCapability } from "../../scope/CapabilityContext";
import { useTweaks } from "../../tweaks/TweaksContext";
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
import { GuardrailsPanel } from "../../guardrails/GuardrailsPanel";
import { CapabilityGate } from "../../components/CapabilityGate";
import { TokenEfficiencyTiles } from "./TokenEfficiencyTiles";
import { TokenConsumptionChart } from "./TokenConsumptionChart";
import { TopFindingsStrip } from "./TopFindingsStrip";
import { TopModelsCard } from "./TopModelsPanel";
import { PulseHealthHeadline } from "./PulseHealthHeadline";
import { usePulseSummary } from "./usePulseSummary";

export const PulsePage = () => {
  // Demo Mode: true when the global Tweak is on, OR once the shared
  // capability probe resolves and finds NO gen_ai.* spans anywhere in scope
  // (a fresh trial install) — the same app-wide signal Bedrock's own
  // `useBedrockAvailable` mirrors for its page. Every wired tile below
  // renders its bundled demo dataset instead of an empty state either way;
  // the inline notice only shows for the automatic (non-Tweak) case, since
  // the Demo Mode Tweak already has its own always-on app-wide banner.
  const capability = useCapability();
  const { pageConfig } = useTweaks();
  const showExample = pageConfig.demoMode || (!capability.isLoading && !capability.hasAnyAiSpans);

  const summary = usePulseSummary(showExample);
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
        {/* Page title + one-line purpose + cross-link to Summary (IA — Information-3).
            Pulse is the live-operations surface; the pill states the relationship
            and hands off to Summary for the executive rollup, carrying the active
            scope over. */}
        <PageIntro
          title="Pulse"
          subtitle="The live-operations surface — the architecture map, live signal tiles, and the findings worth acting on right now across the AI stack."
          crossTo="/summary"
          crossLead="For the executive rollup — the fleet grade and at-rest scorecard — open"
          crossLabel="Summary →"
          crossTitle="Go to Summary (executive rollup) with the current scope"
        />
        {showExample && !pageConfig.demoMode && <ExampleDataNotice tabLabel="Pulse" />}
        {firstError && <ErrorBanner error={firstError} />}
        {/* Top-line health answer (IA — Information-9): the same fleet grade +
            trust index the Summary hero computes, so Pulse leads with one "is it
            healthy right now" verdict before the map and the live tiles. It leads
            with the GRADE (which the map's at-rest tier verdict below does not
            show), so the two are complementary rather than duplicative. */}
        <PulseHealthHeadline summary={summary} showExample={showExample} />
        {/* Hero: the architecture map (priority) with the summary tiles in a
            two-column side panel. The tiles drop below the map when the
            viewport narrows (see .aiobs-pulse-hero). */}
        <div className="aiobs-pulse-hero">
          <ArchitectureMap showExample={showExample} />
          <SummaryTilesRow summary={summary} initialColumns={2} showExample={showExample} />
        </div>
        <CollapsibleDataGapNote
          summary="Data caveats: error rate now includes logical failures · quality, TTFT & per-session spend unavailable"
          message="Error rate now includes logical failures (refusals / content-filter), not just HTTP/exception errors. Quality scoring and TTFT are still unavailable — no evaluation scores or time-to-first-token attributes are emitted — and spend per session/user can't be computed without identity + proxy trace propagation."
          attributes={["gen_ai.evaluation.score", "gen_ai.response.ttft", "session.id", "gen_ai.user"]}
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
          <TokenConsumptionChart showExample={showExample} />
          <ActivityHistogramPanel showExample={showExample} />
        </div>
        <SpendGlance showExample={showExample} />
        <TokenEfficiencyTiles showExample={showExample} />
        <LatencyTierPanel />
        <TopFindingsStrip onSelect={setSelectedFinding} showExample={showExample} />
        <PlatformHealthCard showExample={showExample} />
        <CapabilityGate
          id={["guardrails", "piiCategories"]}
          label="Safety & guardrails — available with instrumentation"
          hint="Emit gen_ai.*.guardrail_* and gen_ai.privacy.* to light up this panel."
        >
          <SafetyPanel showExample={showExample} />
        </CapabilityGate>
        {/* AWS Bedrock guardrail metrics — real intervention data, independent
            of the span-based SafetyPanel capability above (guardrails emit no
            spans in this tenant). Has its own empty/loading/error states. */}
        <GuardrailsPanel showExample={showExample} />
        <CapabilityGate
          id={["feedback", "promptVersion"]}
          label="Feedback & prompt versions — available with instrumentation"
          hint="Emit gen_ai.feedback.* and gen_ai.prompt_hub.* to light up this panel."
        >
          <FeedbackPanel showExample={showExample} />
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
          <AgentCostBarList showExample={showExample} />
          <TopModelsCard showExample={showExample} />
          <ProviderMixDonut showExample={showExample} />
        </div>
      </Flex>
      <FindingDrawer
        finding={selectedFinding}
        onDismiss={() => setSelectedFinding(null)}
      />
    </>
  );
};
