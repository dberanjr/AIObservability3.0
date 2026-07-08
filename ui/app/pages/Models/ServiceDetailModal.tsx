import React, { useMemo } from "react";
import { fmtUSD, fmtTokens, fmtCount } from "../../data/format";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import { useSampling } from "../../scope/SamplingContext";
import { useScope } from "../../scope/ScopeContext";
import { THIRTY_DAYS_MS } from "../Explorer/serviceModelCost";
import { timeframeDurationMs } from "../Explorer/useServiceModelDetail";
import {
  DetailModalShell,
  Section,
  Stat,
  StatGrid,
} from "../../components/DetailModal";
import { BarList } from "../../components/charts/BarList";
import type { BarListItem } from "../../components/charts/BarList";
import type { ServiceCost } from "./useFinOps";

/** Span attribute carrying the human service name (matches the Explorer modal's
 *  "filter to this service" action). */
const SERVICE_ATTR = "service.name";

/** entityName() values can carry trailing " - " separator cruft; clean for the
 *  display title only (the filter uses the raw value untouched). */
const cleanServiceName = (s: string): string =>
  s
    .replace(/(?:\s*[-–—]\s*)+$/, "")
    .replace(/^(?:\s*[-–—]\s*)+/, "")
    .trim() || s;

export interface ServiceDetailModalProps {
  service: ServiceCost;
  onClose: () => void;
}

/**
 * Centered detail modal for one Cost-concentration treemap tile (a service).
 * Shows the three cost views, per-call economics, and the per-model spend
 * breakdown already aggregated in useFinOps — so it opens with no extra query.
 * The footer pushes a global filter on the service.
 */
export const ServiceDetailModal = ({
  service,
  onClose,
}: ServiceDetailModalProps) => {
  const { upsertCondition } = useGlobalFilters();
  const { samplingRatio } = useSampling();
  const { scope } = useScope();

  const samplingFraction =
    Number.isFinite(samplingRatio) && samplingRatio > 0 ? 1 / samplingRatio : 1;
  const sampled = samplingFraction > 0 && samplingFraction < 1;
  const scaleFactor = sampled ? Math.round(1 / samplingFraction) : 1;

  const actual = service.cost;
  const extrapolated =
    samplingFraction > 0 ? actual / samplingFraction : actual;
  const tfMs = timeframeDurationMs(scope.timeframe.from, scope.timeframe.to);
  const monthlyRunRate = tfMs > 0 ? extrapolated * (THIRTY_DAYS_MS / tfMs) : 0;

  const breakdown = useMemo<BarListItem[]>(
    () =>
      service.models.slice(0, 10).map((m) => ({
        key: m.model,
        label: m.model,
        value: m.cost,
        displayValue: fmtUSD(m.cost),
        secondary: `${fmtCount(m.tokens)} tok · ${fmtCount(m.requests)} calls`,
      })),
    [service.models],
  );

  const applyFilter = () => {
    upsertCondition(SERVICE_ATTR, [service.service]);
    onClose();
  };

  return (
    <DetailModalShell
      title={cleanServiceName(service.service)}
      monoTitle
      subtitle={`Service spend · ${service.modelCount} ${service.modelCount === 1 ? "model" : "models"} · cost, economics and model mix`}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={applyFilter}
          style={{
            all: "unset",
            cursor: "pointer",
            background: "var(--green-2)",
            color: "#0a0a0b",
            fontSize: 13,
            fontWeight: 600,
            padding: "8px 14px",
            borderRadius: 6,
          }}
        >
          Filter to this service
        </button>
      }
    >
      {/* Cost */}
      <Section title="Cost">
        <StatGrid cols={3}>
          <Stat label="Actual (observed)" value={fmtUSD(actual)} emphasize />
          <Stat
            label="Estimated (full population)"
            value={fmtUSD(extrapolated)}
            sub={sampled ? `scaled ×${scaleFactor} for sampling` : undefined}
          />
          <Stat
            label="Monthly run-rate"
            value={fmtUSD(monthlyRunRate)}
            sub="projected to 30 days"
          />
        </StatGrid>
      </Section>

      {/* Economics */}
      <Section title="Economics">
        <StatGrid cols={3}>
          <Stat label="$ / 1M tokens" value={fmtUSD(service.costPerMTok)} />
          <Stat label="Requests" value={fmtCount(service.requests)} />
          <Stat label="$ / call" value={fmtUSD(service.costPerRequest)} />
          <Stat
            label="Tokens / call"
            value={fmtTokens(service.tokensPerRequest)}
          />
          <Stat label="Total tokens" value={fmtTokens(service.tokens)} />
          <Stat label="Models" value={fmtCount(service.modelCount)} />
        </StatGrid>
      </Section>

      {/* Spend by model */}
      <Section title="Spend by model">
        {breakdown.length === 0 ? null : (
          <BarList
            items={breakdown}
            color="var(--blue)"
          />
        )}
      </Section>
    </DetailModalShell>
  );
};
