import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import {
  fmtUSD,
  fmtTokens,
  fmtMs,
  fmtPercent,
  fmtCount,
} from "../../data/format";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import { useSampling } from "../../scope/SamplingContext";
import { useServiceModelDetail } from "./useServiceModelDetail";
import { costTrioStats, isEstimatedCost } from "./serviceModelCost";

/** Span attribute used to filter by service. The heatmap's service-cell
 *  FilterTrigger already filters on this attribute, so reusing it keeps the
 *  modal's "filter to this" action consistent with the rest of the page. The
 *  detail QUERY groups by entityName(dt.entity.service), but the global filter
 *  needs a real span attribute, and `service.name` is what carries the human
 *  service name on spans here. */
const SERVICE_ATTR = "service.name";
const MODEL_ATTR = "gen_ai.request.model";

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div
    style={{
      borderTop: "1px solid var(--border)",
      paddingTop: 16,
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}
  >
    <Text style={LABEL_STYLE}>{title}</Text>
    {children}
  </div>
);

const Stat = ({
  label,
  value,
  sub,
  emphasize,
  danger,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasize?: boolean;
  danger?: boolean;
}) => (
  <Flex flexDirection="column" gap={2}>
    <Text style={LABEL_STYLE}>{label}</Text>
    <Text
      style={{
        fontSize: emphasize ? 20 : 15,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.1,
        color: danger ? "var(--red)" : "var(--text)",
      }}
    >
      {value}
    </Text>
    {sub && (
      <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{sub}</Text>
    )}
  </Flex>
);

const StatGrid = ({
  cols,
  children,
}: {
  cols: number;
  children: React.ReactNode;
}) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gap: 16,
    }}
  >
    {children}
  </div>
);

const EstimatedBadge = () => (
  <span
    title="The cost shown is an estimate — this model was priced at a blended/fallback rate. Add it to the Model Pricing table for an exact figure."
    style={{
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: "var(--amber)",
      border: "1px solid var(--amber)",
      borderRadius: 4,
      padding: "1px 6px",
      whiteSpace: "nowrap",
    }}
  >
    ≈ estimated rate
  </span>
);

export interface ServiceModelModalProps {
  service: string;
  /** ALL raw gen_ai.request.model variants that fold into the clicked cell's
   *  canonical column. The detail query matches the full list (and the
   *  "filter to this" action filters on it) so the modal equals the cell. */
  rawModels: string[];
  /** Canonical model label for the header (e.g. the heatmap column label). */
  modelLabel: string;
  onClose: () => void;
}

/**
 * Centered detail modal for one service×model heatmap cell. Shows the three
 * cost views, the model's pricing card, and the golden signals, plus a
 * "filter to this service + model" action that pushes two global-filter
 * conditions. Click-backdrop / Esc to dismiss.
 */
export const ServiceModelModal = ({
  service,
  rawModels,
  modelLabel,
  onClose,
}: ServiceModelModalProps) => {
  const { metrics, cost, isLoading } = useServiceModelDetail(service, rawModels);
  const { upsertCondition } = useGlobalFilters();
  const { samplingRatio } = useSampling();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const samplingFraction =
    Number.isFinite(samplingRatio) && samplingRatio > 0 ? 1 / samplingRatio : 1;

  const applyFilter = () => {
    upsertCondition(SERVICE_ATTR, [service]);
    // Filter on the FULL raw-model list — matches the column-header
    // FilterTrigger and the detail query's membership filter.
    upsertCondition(MODEL_ATTR, rawModels);
    onClose();
  };

  // The raw entityName(dt.entity.service) value (which the detail query filters
  // on, so it must be passed through untouched) can carry trailing separator
  // cruft like "svc - bos-svc - " — strip leading/trailing " - "/whitespace for
  // the DISPLAY title only so it doesn't render as "svc - bos-svc - × Model".
  const serviceLabel = service.replace(/(?:\s*[-–—]\s*)+$/, "").replace(/^(?:\s*[-–—]\s*)+/, "").trim() || service;
  const title = `${serviceLabel} × ${modelLabel}`;
  const estimated = cost ? isEstimatedCost(cost.pricing) : false;
  // "No data" only after loading settles; while loading we show a skeleton.
  const empty = !isLoading && !metrics;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={title}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 10, 11, 0.55)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 640,
          maxHeight: "calc(100vh - 64px)",
          background: "var(--surface)",
          borderRadius: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          overflow: "auto",
        }}
      >
        {/* Header */}
        <Flex alignItems="flex-start" justifyContent="space-between" gap={16}>
          <Flex flexDirection="column" gap={4}>
            <Heading
              level={2}
              style={{
                fontSize: 18,
                fontWeight: 700,
                fontFamily: "var(--mono, monospace)",
              }}
            >
              {title}
            </Heading>
            <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
              Cost, pricing and golden signals for this service / model pair
            </Text>
          </Flex>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              all: "unset",
              cursor: "pointer",
              padding: "2px 8px",
              borderRadius: 6,
              fontSize: 18,
              lineHeight: 1,
              color: "var(--text-3)",
            }}
          >
            ×
          </button>
        </Flex>

        {isLoading ? (
          <Skeleton style={{ height: 320 }} />
        ) : empty ? (
          <Text style={{ fontSize: 13, color: "var(--text-3)" }}>
            No data for this service / model pair in the current scope.
          </Text>
        ) : (
          metrics &&
          cost && (
            <>
              {/* Cost */}
              <Section title="Cost">
                <Flex alignItems="center" gap={8}>
                  {estimated && <EstimatedBadge />}
                </Flex>
                <StatGrid cols={3}>
                  {costTrioStats(cost, samplingFraction).map((s, i) => (
                    <Stat
                      key={s.label}
                      label={s.label}
                      value={fmtUSD(s.value)}
                      sub={s.sub}
                      emphasize={i === 0}
                    />
                  ))}
                </StatGrid>
              </Section>

              {/* Model pricing */}
              <Section title="Model pricing">
                <StatGrid cols={3}>
                  <Stat
                    label="Input $/M"
                    value={fmtUSD(cost.pricing.inputPerMTok)}
                  />
                  <Stat
                    label="Output $/M"
                    value={fmtUSD(cost.pricing.outputPerMTok)}
                  />
                  <Stat
                    label="Context window"
                    value={
                      cost.pricing.contextWindow != null
                        ? fmtTokens(cost.pricing.contextWindow)
                        : "—"
                    }
                  />
                  {cost.pricing.cacheReadPerMTok != null && (
                    <Stat
                      label="Cache read $/M"
                      value={fmtUSD(cost.pricing.cacheReadPerMTok)}
                    />
                  )}
                  {cost.pricing.cacheWritePerMTok != null && (
                    <Stat
                      label="Cache write $/M"
                      value={fmtUSD(cost.pricing.cacheWritePerMTok)}
                    />
                  )}
                  <Stat label="Provider" value={cost.pricing.provider} />
                  <Stat label="Tier" value={cost.pricing.tier} />
                </StatGrid>
              </Section>

              {/* Golden signals */}
              <Section title="Golden signals">
                <StatGrid cols={3}>
                  <Stat label="Requests" value={fmtCount(metrics.requests)} />
                  <Stat
                    label="Error rate"
                    value={fmtPercent(metrics.errorRatePct)}
                    sub={`${fmtCount(metrics.errors)} errors`}
                    danger={metrics.errorRatePct > 0}
                  />
                  {metrics.logicalErrors > 0 && (
                    <Stat
                      label="OTel error markers"
                      value={fmtCount(metrics.logicalErrors)}
                    />
                  )}
                  <Stat label="Latency p50" value={fmtMs(metrics.p50Ms)} />
                  <Stat label="Latency p90" value={fmtMs(metrics.p90Ms)} />
                  <Stat label="Latency p95" value={fmtMs(metrics.p95Ms)} />
                  <Stat
                    label="Tokens / req"
                    value={fmtCount(metrics.tokensPerReq)}
                  />
                  <Stat label="Total tokens in" value={fmtTokens(metrics.inTok)} />
                  <Stat
                    label="Total tokens out"
                    value={fmtTokens(metrics.outTok)}
                  />
                </StatGrid>
              </Section>
            </>
          )
        )}

        {/* Action */}
        <div
          style={{
            borderTop: "1px solid var(--border)",
            paddingTop: 16,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
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
            Filter to this service + model
          </button>
        </div>
      </div>
    </div>
  );
};
