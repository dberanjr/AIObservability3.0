import React, { useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { ErrorBanner } from "../../components/ErrorState";
import { PageIntro } from "../../components/PageIntro";
import { FindingDrawer } from "../../components/drawers/FindingDrawer";
import type { Finding } from "../../components/drawers/types";
import { ScanScope } from "../../scope/ScanReportContext";
import { useEditLayout } from "../../layout/EditLayoutContext";
import { SummaryLayoutProvider, CollapsibleTile } from "./CollapsibleTile";
import { CustomizableGrid, type GridTile } from "./CustomizableGrid";
import { usePulseSummary } from "../Pulse/usePulseSummary";
import { useFleetPosture } from "./useFleetPosture";
import { PostureBand } from "./PostureBand";
import { QualityTrustCard } from "./QualityTrustCard";
import { FinOpsCard } from "./FinOpsCard";
import { EfficiencyMixCard } from "./EfficiencyMixCard";
import { LatencyTierCard } from "./LatencyTierCard";
import { HiddenFailuresCard } from "./HiddenFailuresCard";
import { TopAgentsCard } from "./TopAgentsCard";
import { ActivityCard } from "./ActivityCard";
import { ProblemPatternsCard } from "./ProblemPatternsCard";
import { TopFindingsCard } from "./TopFindingsCard";
import { GuardrailsSummaryCard } from "../../guardrails/GuardrailsSummaryCard";

/**
 * A titled band that segments the page into a logical reading order for both
 * executives (top-to-bottom narrative) and operators (each section is a
 * self-contained workspace). The eyebrow label names the question the section
 * answers; the optional hint gives one line of orientation.
 */
const Section = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <section className="aiobs-summary-section">
    <div className="aiobs-summary-section-head">
      <span className="aiobs-summary-section-label">{label}</span>
      {hint && <span className="aiobs-summary-section-hint">{hint}</span>}
    </div>
    {children}
  </section>
);

/**
 * Summary — the app's front door. A light, data-dense navigation hub above the
 * tabs: every tile is a live KPI (through the reused Pulse/Models/Explorer/Agents
 * hooks and the cache-aware cost model) and an entry point that routes into the
 * owning tab. It does NOT replace Pulse — Pulse keeps its architecture map. All
 * data flows through useScopedDql, so the global timeframe, segments,
 * scan-limit, and trace filter apply here exactly like every other tab.
 *
 * Each card is wrapped in a <ScanScope> so the (Tweaks-gated) scanned-data
 * debug badges can attribute Grail scan cost to the exact tile it fed.
 */
export const SummaryPage = () => {
  const summary = usePulseSummary();
  const posture = useFleetPosture();
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  // Layout customization is opt-in and driven by the global header "Customize"
  // toggle, so it's reachable from every page (SUM-4).
  const { editLayout } = useEditLayout();

  const firstError = summary.error ?? posture.error ?? null;
  // Retry re-runs both hero data sources — the banner surfaces whichever of the
  // two errored, so a single Retry covers both (SUM-3).
  const retryHero = () => {
    summary.refetch();
    posture.refetch();
  };

  // Each tile is wrapped once: ScanScope (attributes DQL scan cost to the tile)
  // → CollapsibleTile (tuck-away + lazy queries). The customizable grid then
  // owns placement (reorder + resize). defaultColSpan is out of 12.
  const makeTile = (
    id: string,
    title: string,
    defaultColSpan: number,
    node: React.ReactNode,
  ): GridTile => ({
    id,
    defaultColSpan,
    node: (
      <ScanScope name={id}>
        <CollapsibleTile id={id} title={title}>
          {node}
        </CollapsibleTile>
      </ScanScope>
    ),
  });

  const qualityTiles: GridTile[] = [
    // Four quarter-width tiles so Quality, Spend, Efficiency, and Guardrails
    // share ONE row at equal (stretched) height — Guardrails no longer wraps
    // to a second row leaving the Quality tile tall and half-empty.
    makeTile("quality", "Is it good? · Quality & trust", 3, <QualityTrustCard />),
    makeTile("finops", "Spend · FinOps", 3, <FinOpsCard />),
    makeTile("efficiency", "Efficiency & mix", 3, <EfficiencyMixCard />),
    makeTile("guardrails", "AI Guardrails", 3, <GuardrailsSummaryCard />),
  ];
  const opsTiles: GridTile[] = [
    makeTile("latency", "Latency by tier", 3, <LatencyTierCard summary={summary} />),
    makeTile("hidden", "Hidden · 200-OK", 3, <HiddenFailuresCard />),
    makeTile("agents", "Top agents by cost", 3, <TopAgentsCard />),
    makeTile("activity", "Activity · 24h", 3, <ActivityCard />),
  ];
  const signalTiles: GridTile[] = [
    makeTile("patterns", "Problem patterns", 7, <ProblemPatternsCard />),
    makeTile("findings", "Top findings", 5, <TopFindingsCard onSelect={setSelectedFinding} />),
  ];

  return (
    <SummaryLayoutProvider>
      <div className="aiobs-summary-page">
      <Flex
        flexDirection="column"
        gap={24}
        style={{ padding: "18px 20px 28px" }}
      >
        {/* Page title + one-line purpose + cross-link to Pulse (IA — Information-3).
            Summary is the executive, at-rest scorecard; the pill states the
            relationship and hands off to Pulse for live operations, carrying the
            active scope over. */}
        <PageIntro
          title="Summary"
          subtitle="The executive, at-rest scorecard — fleet grade plus the headline KPIs for AI health, spend, and quality across every workload in scope."
          crossTo="/pulse"
          crossLead="For live operations — the architecture map and real-time signals — open"
          crossLabel="Pulse →"
          crossTitle="Go to Pulse (live operations) with the current scope"
        />
        {firstError && <ErrorBanner error={firstError} onRetry={retryHero} />}

        {/* Hero — the headline answer: fleet grade + the six KPIs. Always on. */}
        <ScanScope name="posture">
          <PostureBand summary={summary} posture={posture} />
        </ScanScope>

        {/* Value story — is it good, what does it cost, how efficient is it. */}
        <Section
          label="Quality, cost & efficiency"
          hint={
            editLayout
              ? "Drag a tile's top strip to reorder, drag a corner to resize · Done editing to lock"
              : "Trust, spend, and how much output each dollar buys"
          }
        >
          <CustomizableGrid storageKey="quality2" columns={12} tiles={qualityTiles} editable={editLayout} />
        </Section>

        {/* Operations — where latency, hidden failures, and load actually live. */}
        <Section
          label="Operations & activity"
          hint="Latency, silent failures, cost drivers, and 24-hour load"
        >
          <CustomizableGrid storageKey="operations" columns={12} tiles={opsTiles} editable={editLayout} />
        </Section>

        {/* Signals — the detectors and findings that drive investigation. */}
        <Section
          label="Problem signals"
          hint="Detector volume and the findings worth opening first"
        >
          <CustomizableGrid storageKey="signals" columns={12} tiles={signalTiles} editable={editLayout} />
        </Section>
      </Flex>
      </div>
      <FindingDrawer finding={selectedFinding} onDismiss={() => setSelectedFinding(null)} />
    </SummaryLayoutProvider>
  );
};
