import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import {
  fmtUSD,
  fmtTokens,
  fmtMs,
  fmtPercent,
  fmtCount,
} from "../../data/format";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import { useSampling } from "../../scope/SamplingContext";
import { useScope } from "../../scope/ScopeContext";
import {
  costTrioStats,
  isEstimatedCost,
  THIRTY_DAYS_MS,
  type ServiceModelCost,
} from "../Explorer/serviceModelCost";
import { timeframeDurationMs } from "../Explorer/useServiceModelDetail";
import {
  DetailModalShell,
  Section,
  Stat,
  StatGrid,
  EstimatedBadge,
} from "../../components/DetailModal";
import { MODEL_TYPE_LABEL, type ModelRow } from "./useModels";

const MODEL_ATTR = "gen_ai.request.model";

export interface ModelDetailModalProps {
  model: ModelRow;
  onClose: () => void;
}

/**
 * Centered detail modal for one All-Models row. The clicked `ModelRow` already
 * carries every aggregate the modal needs, so this opens instantly with no
 * extra query. The "Actual (observed)" cost equals the table's Cost column;
 * the other two views extrapolate for sampling and project a 30-day run-rate
 * the same way the Explorer service×model modal does. The footer pushes a
 * global filter on this model's raw variants.
 */
export const ModelDetailModal = ({ model, onClose }: ModelDetailModalProps) => {
  const { upsertCondition } = useGlobalFilters();
  const { samplingRatio } = useSampling();
  const { scope } = useScope();

  // Toolbar samplingRatio is "1 in N" (1 = no sampling); the cost helpers want
  // the FRACTION observed.
  const samplingFraction =
    Number.isFinite(samplingRatio) && samplingRatio > 0 ? 1 / samplingRatio : 1;

  // Build the three cost views from the row's already-computed cost so "Actual"
  // matches the table exactly (rather than recomputing and risking a mismatch
  // on which raw-model variant resolves the pricing key).
  const actual = model.cost;
  const extrapolated =
    samplingFraction > 0 ? actual / samplingFraction : actual;
  const tfMs = timeframeDurationMs(scope.timeframe.from, scope.timeframe.to);
  const monthlyRunRate = tfMs > 0 ? extrapolated * (THIRTY_DAYS_MS / tfMs) : 0;
  const cost: ServiceModelCost = {
    actual,
    extrapolated,
    monthlyRunRate,
    pricing: model.pricing,
  };
  const estimated = isEstimatedCost(model.pricing) || model.pricingUnknown;

  const totalTokens = model.inputTokens + model.outputTokens;
  const tokensPerReq = model.requests > 0 ? totalTokens / model.requests : 0;

  const applyFilter = () => {
    upsertCondition(MODEL_ATTR, model.rawModels);
    onClose();
  };

  return (
    <DetailModalShell
      title={model.model}
      monoTitle
      subtitle={`${model.provider.label}${model.provider.viaBedrock ? " · via Bedrock" : ""} · ${MODEL_TYPE_LABEL[model.type]} · cost, pricing and golden signals`}
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
          Filter to this model
        </button>
      }
    >
      {/* Cost */}
      <Section title="Cost">
        {estimated && (
          <Flex alignItems="center" gap={8}>
            <EstimatedBadge />
          </Flex>
        )}
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
          <Stat label="Input $/M" value={fmtUSD(model.pricing.inputPerMTok)} />
          <Stat label="Output $/M" value={fmtUSD(model.pricing.outputPerMTok)} />
          <Stat
            label="Context window"
            value={
              model.pricing.contextWindow != null
                ? fmtTokens(model.pricing.contextWindow)
                : "—"
            }
          />
          {model.pricing.cacheReadPerMTok != null && (
            <Stat
              label="Cache read $/M"
              value={fmtUSD(model.pricing.cacheReadPerMTok)}
            />
          )}
          {model.pricing.cacheWritePerMTok != null && (
            <Stat
              label="Cache write $/M"
              value={fmtUSD(model.pricing.cacheWritePerMTok)}
            />
          )}
          <Stat label="Provider" value={model.pricing.provider} />
          <Stat label="Tier" value={model.pricing.tier} />
          <Stat
            label="Blended $/1M"
            value={fmtUSD(model.costPerMTok)}
            sub="observed rate"
          />
        </StatGrid>
      </Section>

      {/* Golden signals */}
      <Section title="Golden signals">
        <StatGrid cols={3}>
          <Stat label="Requests" value={fmtCount(model.requests)} />
          <Stat
            label="Error rate"
            value={model.errors > 0 ? fmtPercent(model.errorRatePct) : "0%"}
            sub={`${fmtCount(model.errors)} errors`}
            danger={model.errorRatePct > 5}
          />
          <Stat
            label="Timeout rate"
            value={
              model.hasTimeoutAttribute
                ? model.timeouts > 0
                  ? fmtPercent(model.timeoutRatePct, 2)
                  : "0%"
                : "—"
            }
          />
          <Stat label="Latency avg" value={fmtMs(model.avgMs)} />
          <Stat label="Latency p95" value={fmtMs(model.p95Ms)} />
          <Stat label="Latency p99" value={fmtMs(model.p99Ms)} />
          <Stat label="Tokens / req" value={fmtCount(tokensPerReq)} />
          <Stat label="Total tokens in" value={fmtTokens(model.inputTokens)} />
          <Stat label="Total tokens out" value={fmtTokens(model.outputTokens)} />
          <Stat
            label="Context util"
            value={
              model.contextUtilizationPct != null
                ? fmtPercent(model.contextUtilizationPct, 0)
                : "—"
            }
          />
          <Stat
            label="Tokens / sec"
            value={
              model.tokensPerSec != null
                ? Math.round(model.tokensPerSec).toLocaleString()
                : "—"
            }
          />
        </StatGrid>
      </Section>
    </DetailModalShell>
  );
};
