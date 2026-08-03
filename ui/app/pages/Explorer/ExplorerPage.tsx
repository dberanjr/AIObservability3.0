import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { useSearchParams } from "react-router-dom";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import { useCapability } from "../../scope/CapabilityContext";
import { useTweaks } from "../../tweaks/TweaksContext";
import { ErrorBanner } from "../../components/ErrorState";
import { CollapsibleDataGapNote } from "../../components/CollapsibleDataGapNote";
import { ExampleDataNotice } from "../../components/ExampleDataNotice";
import { FindingDrawer } from "../../components/drawers/FindingDrawer";
import {
  DEFAULT_FINDING_INTENTS,
  type Finding,
} from "../../components/drawers/types";
import type { ProviderId } from "../../detection/attributes";
import { ALL_PROVIDER_IDS } from "../../detection/attributes";
import { AIServicesTable } from "./AIServicesTable";
import { ExplorerFindings } from "./ExplorerFindings";
import { ExplorerSidebar } from "./ExplorerSidebar";
import { ExplorerTiles } from "./ExplorerTiles";
import { RagPanel } from "./RagPanel";
import { CapabilityGate } from "../../components/CapabilityGate";
import { ScanScopedTile } from "../../scope/ScanScopedTile";
import { ServiceModelHeatmap } from "./ServiceModelHeatmap";
import {
  type AIService,
  type ExplorerFilter,
  useAIServices,
} from "./useAIServices";
import { useExplorerFindings } from "./useExplorerFindings";
import { useExplorerSummary } from "./useExplorerSummary";
import { SECTION_IDS } from "./tileActions";
import { estimateServiceRowCost } from "./serviceModelCost";
import { fmtCount, fmtPercent, fmtTokens, fmtUSDCompact } from "../../data/format";

const PROVIDER_SET = new Set<ProviderId>(ALL_PROVIDER_IDS);

const parseList = (value: string | null): string[] | undefined => {
  if (!value) return undefined;
  const arr = value.split(",").map((s) => s.trim()).filter(Boolean);
  return arr.length > 0 ? arr : undefined;
};

const parseProviders = (value: string | null): ProviderId[] | undefined => {
  const list = parseList(value);
  if (!list) return undefined;
  const valid = list.filter((v): v is ProviderId =>
    PROVIDER_SET.has(v as ProviderId),
  );
  return valid.length > 0 ? valid : undefined;
};

const filterFromParams = (params: URLSearchParams): ExplorerFilter => ({
  search: params.get("q") || undefined,
  providers: parseProviders(params.get("providers")),
  frameworks: parseList(params.get("frameworks")),
  models: parseList(params.get("models")),
});

const applyFilterToParams = (
  filter: ExplorerFilter,
  params: URLSearchParams,
): URLSearchParams => {
  const next = new URLSearchParams(params);
  const setOrDelete = (key: string, value?: string | string[]) => {
    if (!value || (Array.isArray(value) && value.length === 0)) {
      next.delete(key);
      return;
    }
    next.set(key, Array.isArray(value) ? value.join(",") : value);
  };
  setOrDelete("q", filter.search);
  setOrDelete("providers", filter.providers);
  setOrDelete("frameworks", filter.frameworks);
  setOrDelete("models", filter.models);
  return next;
};

/**
 * Build a rich FindingDrawer payload from an AI-services row, reusing the row's
 * already-loaded metrics (estimated cost, tokens, models, errors) instead of a
 * boilerplate sentence, so the primary table's drill-in isn't the thinnest one
 * on the page (Explorer-10).
 */
const findingForService = (svc: AIService): Finding => {
  const cost = estimateServiceRowCost({
    inTok: svc.inTok,
    outTok: svc.outTok,
    models: svc.models,
  });
  const severity: Finding["severity"] =
    svc.errorRatePct > 5
      ? "critical"
      : svc.errorRatePct > 1 || svc.logicalErrors > 0
        ? "warning"
        : "info";
  const modelList =
    svc.modelDisplay.length > 0 ? svc.modelDisplay.join(", ") : "none reported";
  return {
    id: `svc-${svc.serviceId}`,
    severity,
    category: "AI service",
    entity: svc.service,
    metric: `${fmtUSDCompact(cost.usd)}${cost.estimated ? " est." : ""} · ${fmtCount(svc.requests)} LLM req`,
    context: `${svc.modelDisplay.length} ${svc.modelDisplay.length === 1 ? "model" : "models"} · ${svc.agents} agents · ${fmtTokens(svc.tokens)} tokens · ${fmtTokens(Math.round(svc.tokPerReq))} tok/req`,
    detail: `Error rate ${fmtPercent(svc.errorRatePct)} (${fmtCount(svc.errors)} errored spans) · ${fmtCount(svc.logicalErrors)} logical errors.${svc.framework ? ` Framework ${svc.framework}.` : ""} Models: ${modelList}.`,
    intents: DEFAULT_FINDING_INTENTS,
  };
};

export const ExplorerPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = useMemo<ExplorerFilter>(
    () => filterFromParams(searchParams),
    [searchParams],
  );
  const setFilter = useCallback(
    (next: ExplorerFilter) => {
      setSearchParams(
        (current) => applyFilterToParams(next, current),
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // The Explorer sidebar filter lives in URL params (q/providers/frameworks/
  // models), which the shared toolbar's Reset can't reach on its own. Register
  // a handler so global Reset clears ONLY those keys — applyFilterToParams({})
  // removes exactly the four filter keys and preserves timeframe/other state.
  const { registerResetHandler } = useGlobalFilters();
  useEffect(
    () => registerResetHandler(() => setFilter({})),
    [registerResetHandler, setFilter],
  );

  // Demo Mode: force every tile to render its bundled demo dataset when the
  // global Tweak is on, OR automatically once the app-wide capability probe
  // resolves and finds no AI telemetry at all in scope (fresh trial install) —
  // mirrors the Bedrock page's `showExample` fallback, reusing the SAME
  // shared probe (no new existence-check query).
  const capability = useCapability();
  const { pageConfig } = useTweaks();
  const showExample =
    pageConfig.demoMode || (!capability.isLoading && !capability.hasAnyAiSpans);

  const aiServices = useAIServices(filter, showExample);
  const summary = useExplorerSummary(aiServices.services);
  const findings = useExplorerFindings(aiServices.services, summary);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);

  // Controlled collapse state for the two sections KPI tiles scroll to, so a
  // tile can force its target open before scrolling (never land on a collapsed
  // header with no data). The cards stay user-collapsible via onOpenChange.
  const [heatmapOpen, setHeatmapOpen] = useState(true);
  const [servicesOpen, setServicesOpen] = useState(true);
  const revealSection = useCallback((id: string) => {
    if (id === SECTION_IDS.heatmap) setHeatmapOpen(true);
    if (id === SECTION_IDS.servicesTable) setServicesOpen(true);
    // Let the expand commit before scrolling so the section is visible on arrival.
    requestAnimationFrame(() => {
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  // The heatmap query now runs inside ServiceModelHeatmap's lazily-mounted body
  // (so a collapsed section issues no DQL); its errors surface within that card.
  const firstError = aiServices.error ?? null;

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "240px minmax(0, 1fr)",
          gap: 16,
          padding: "18px 20px 80px",
          alignItems: "start",
        }}
      >
        <ExplorerSidebar
          facets={aiServices.facets}
          filter={filter}
          onFilterChange={setFilter}
        />
        <Flex flexDirection="column" gap={16} style={{ minWidth: 0 }}>
          {/* Page title + one-line purpose (IA): a consistent anchor at the top
              of the page so it reads the same as the other tabs. */}
          <Flex flexDirection="column" gap={2}>
            <Heading level={1} style={{ fontSize: 18, fontWeight: 700 }}>
              Explorer
            </Heading>
            <Text style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.4 }}>
              Every AI service in scope — cost, tokens, latency and errors by
              service and model, with retrieval and framework attribution.
            </Text>
          </Flex>
          {/* Only the AUTOMATIC no-telemetry fallback gets this inline notice —
              when the global Demo Mode Tweak is on, the app-wide banner
              already covers it (avoid double messaging). */}
          {showExample && !pageConfig.demoMode && (
            <ExampleDataNotice tabLabel="Explorer" />
          )}
          {firstError && <ErrorBanner error={firstError} />}
          <ExplorerTiles
            summary={summary}
            isLoading={aiServices.isLoading}
            onRevealSection={revealSection}
          />
          <CollapsibleDataGapNote
            summary="Data note: “AI Service” is inferred from gen_ai.* spans · framework attribution is heuristic"
            message="An “AI Service” here is any monitored service emitting gen_ai.* spans (resolved from service.name / dt.entity.service). Framework attribution (LangGraph, AgentExecutor, RunnableSequence…) is inferred from span names/kinds because no explicit framework tag is emitted, so it can be approximate."
            attributes={["gen_ai.framework"]}
            bestPractice="Emit a stable gen_ai.framework tag on agent spans so framework attribution and the framework filter are exact rather than heuristic. See INSTRUMENTATION-REQUIREMENTS.md P2.4."
            href="https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/"
            hrefLabel="OTel GenAI"
          />
          <ExplorerFindings
            findings={findings}
            isLoading={aiServices.isLoading}
            onSelect={setSelectedFinding}
          />
          <div id={SECTION_IDS.heatmap} style={{ scrollMarginTop: 12 }}>
            <ScanScopedTile name="Service × model usage">
              <ServiceModelHeatmap
                open={heatmapOpen}
                onOpenChange={setHeatmapOpen}
                showExample={showExample}
              />
            </ScanScopedTile>
          </div>
          {/* CapabilityGate decides visibility from REAL telemetry coverage, so
              it can't see demo data — bypass it in showExample and render the
              panel directly (its own demo dataset lights up unconditionally),
              matching every other tile's Demo Mode behaviour on this page. */}
          {showExample ? (
            <ScanScopedTile name="Retrieval (RAG)">
              <RagPanel showExample={showExample} />
            </ScanScopedTile>
          ) : (
            <CapabilityGate
              id="vectorDb"
              label="Retrieval (RAG) — available with instrumentation"
              hint={
                <>
                  Emit vector-store retrieval spans (<code>db.system</code> /{" "}
                  <code>vector_db.*</code>) and this panel lights up with
                  retrievals, vector stores and average top-k automatically.
                </>
              }
            >
              <ScanScopedTile name="Retrieval (RAG)">
                <RagPanel />
              </ScanScopedTile>
            </CapabilityGate>
          )}
          <div id={SECTION_IDS.servicesTable} style={{ scrollMarginTop: 12 }}>
          <AIServicesTable
            rows={aiServices.filtered}
            isLoading={aiServices.isLoading}
            truncated={aiServices.truncated}
            open={servicesOpen}
            onOpenChange={setServicesOpen}
            onRowClick={(svc) => setSelectedFinding(findingForService(svc))}
          />
          </div>
        </Flex>
      </div>
      <FindingDrawer
        finding={selectedFinding}
        onDismiss={() => setSelectedFinding(null)}
      />
    </>
  );
};
