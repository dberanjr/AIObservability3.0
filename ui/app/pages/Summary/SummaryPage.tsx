import React, { useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { ErrorBanner } from "../../components/ErrorState";
import { FindingDrawer } from "../../components/drawers/FindingDrawer";
import type { Finding } from "../../components/drawers/types";
import { ScanScope } from "../../scope/ScanReportContext";
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
  // Layout customization is opt-in: the default landing is calm and read-only,
  // with drag/resize/reset revealed only in edit mode (SUM-4).
  const [editLayout, setEditLayout] = useState(false);

  const firstError = summary.error ?? posture.error ?? null;

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
    makeTile("quality", "Is it good? · Quality & trust", 4, <QualityTrustCard />),
    makeTile("finops", "Spend · FinOps", 4, <FinOpsCard />),
    makeTile("efficiency", "Efficiency & mix", 4, <EfficiencyMixCard />),
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
        {firstError && <ErrorBanner error={firstError} />}

        <Flex justifyContent="flex-end">
          <button
            type="button"
            onClick={() => setEditLayout((v) => !v)}
            title="Rearrange and resize the tiles below"
            style={{
              all: "unset",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              padding: "5px 12px",
              borderRadius: 8,
              border: `1px solid ${editLayout ? "var(--blue)" : "var(--border)"}`,
              color: editLayout ? "#fff" : "var(--text-2)",
              background: editLayout ? "var(--blue)" : "transparent",
            }}
          >
            {editLayout ? "Done editing" : "⚙ Customize layout"}
          </button>
        </Flex>

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
          <CustomizableGrid storageKey="quality" columns={12} tiles={qualityTiles} editable={editLayout} />
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
