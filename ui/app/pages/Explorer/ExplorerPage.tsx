import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { useSearchParams } from "react-router-dom";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import { ErrorBanner } from "../../components/ErrorState";
import { DataGapNote } from "../../components/DataGapNote";
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
import { ServiceModelHeatmap } from "./ServiceModelHeatmap";
import {
  type ExplorerFilter,
  useAIServices,
} from "./useAIServices";
import { useExplorerFindings } from "./useExplorerFindings";
import { useExplorerSummary } from "./useExplorerSummary";
import { SECTION_IDS } from "./tileActions";

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

  const aiServices = useAIServices(filter);
  const summary = useExplorerSummary(aiServices.services);
  const findings = useExplorerFindings(aiServices.services, summary);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);

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
          {firstError && <ErrorBanner error={firstError} />}
          <ExplorerTiles
            summary={summary}
            isLoading={aiServices.isLoading}
          />
          <DataGapNote
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
            <ServiceModelHeatmap />
          </div>
          <CapabilityGate id="vectorDb">
            <RagPanel />
          </CapabilityGate>
          <div id={SECTION_IDS.servicesTable} style={{ scrollMarginTop: 12 }}>
          <AIServicesTable
            rows={aiServices.filtered}
            isLoading={aiServices.isLoading}
            onRowClick={(svc) =>
              setSelectedFinding({
                id: `svc-${svc.serviceId}`,
                severity: svc.errorRatePct > 5 ? "critical" : "info",
                category: "AI service",
                entity: svc.service,
                metric: `${svc.requests.toLocaleString()} requests`,
                context: `${svc.models.length} models · ${svc.agents} agents · ${svc.logicalErrors} logical errors`,
                detail:
                  "Drill into traces, problems, or notebooks for this service.",
                intents: DEFAULT_FINDING_INTENTS,
              })
            }
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
