import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { fmtCount, fmtMs, fmtPercent, fmtUSD } from "../../data/format";
import type { ModelRow } from "../Models/useModels";
import { MODEL_TYPE_LABEL } from "../Models/useModels";

const Metric = ({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) => (
  <Flex justifyContent="space-between" alignItems="baseline" gap={6}>
    <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>{label}</Text>
    <Text
      style={{
        fontSize: 12.5,
        fontWeight: 600,
        color: color ?? "var(--text)",
        fontFamily: "var(--mono, monospace)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {value}
    </Text>
  </Flex>
);

const WinnerBadge = ({ accent }: { accent: string }) => (
  <Flex
    alignItems="center"
    gap={4}
    style={{
      position: "absolute",
      top: 12,
      right: 12,
      padding: "3px 10px",
      borderRadius: 999,
      background: `color-mix(in oklab, ${accent} 18%, transparent)`,
      border: `1px solid color-mix(in oklab, ${accent} 50%, transparent)`,
      color: accent,
      fontSize: 10.5,
      fontWeight: 700,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
    }}
  >
    ★ Recommended
  </Flex>
);

const UpstreamChip = ({ name }: { name: string }) => (
  <span
    style={{
      padding: "2px 8px",
      borderRadius: 999,
      background: "var(--surface-3)",
      fontSize: 11,
      color: "var(--text-2)",
      fontFamily: "var(--mono, monospace)",
    }}
  >
    {name}
  </span>
);

export interface ComparisonCardProps {
  card: "A" | "B";
  model: ModelRow | null;
  options: ModelRow[];
  onSelect: (modelKey: string) => void;
  upstreamServices: string[];
  isWinner: boolean;
  accent: string;
  weightedScore: number | null;
  disqualifiedReason?: string;
}

export const ComparisonCard = ({
  card,
  model,
  options,
  onSelect,
  upstreamServices,
  isWinner,
  accent,
  weightedScore,
  disqualifiedReason,
}: ComparisonCardProps) => (
  <Surface
    elevation="raised"
    padding={16}
    style={{
      position: "relative",
      border: isWinner ? `2px solid ${accent}` : undefined,
    }}
  >
    {isWinner && <WinnerBadge accent={accent} />}
    <Flex flexDirection="column" gap={12}>
      <Flex alignItems="center" gap={8}>
        <div
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: `color-mix(in oklab, ${accent} 18%, transparent)`,
            color: accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {card}
        </div>
        <Flex flexDirection="column" gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Heading level={4} style={{ fontSize: 13, fontWeight: 600 }}>
            Candidate {card}
          </Heading>
          <select
            value={model?.modelKey ?? ""}
            onChange={(e) => onSelect(e.target.value)}
            style={{
              padding: "4px 6px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              fontFamily: "var(--mono, monospace)",
              fontSize: 12.5,
              color: "var(--text)",
              maxWidth: "100%",
            }}
          >
            {options.length === 0 && <option value="">No models</option>}
            {options.map((m) => (
              <option key={m.modelKey} value={m.modelKey}>
                {m.model}
              </option>
            ))}
          </select>
        </Flex>
        {weightedScore != null && (
          <Flex flexDirection="column" alignItems="flex-end" gap={2}>
            <Text style={{ fontSize: 10.5, color: "var(--text-3)" }}>
              Weighted
            </Text>
            <Text
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: accent,
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
              }}
            >
              {weightedScore.toFixed(0)}
            </Text>
          </Flex>
        )}
      </Flex>

      {model ? (
        <Flex flexDirection="column" gap={6}>
          <Metric
            label="Provider"
            value={model.provider.label}
            color={model.providerColor}
          />
          <Metric label="Type" value={MODEL_TYPE_LABEL[model.type]} />
          <Metric label="Requests" value={fmtCount(model.requests)} />
          <Metric label="Avg latency" value={fmtMs(model.avgMs)} />
          <Metric label="P95 latency" value={fmtMs(model.p95Ms)} />
          <Metric label="Cost · scope" value={fmtUSD(model.cost)} />
          <Metric
            label="Cost / request"
            value={
              model.requests > 0 ? fmtUSD(model.cost / model.requests) : "—"
            }
          />
          <Metric label="Error rate" value={fmtPercent(model.errorRatePct)} />
        </Flex>
      ) : (
        <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
          Select a model to compare.
        </Text>
      )}

      <Flex flexDirection="column" gap={4}>
        <Text
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}
        >
          Called by
        </Text>
        <Flex gap={4} style={{ flexWrap: "wrap" }}>
          {upstreamServices.length > 0 ? (
            upstreamServices
              .slice(0, 4)
              .map((s) => <UpstreamChip key={s} name={s} />)
          ) : (
            <Text style={{ fontSize: 11, color: "var(--text-4)" }}>
              No upstream attribution
            </Text>
          )}
          {upstreamServices.length > 4 && (
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
              +{upstreamServices.length - 4}
            </Text>
          )}
        </Flex>
      </Flex>

      {disqualifiedReason && (
        <Text
          style={{
            fontSize: 11,
            color: "var(--amber)",
            background:
              "color-mix(in oklab, var(--amber) 8%, transparent)",
            border:
              "1px solid color-mix(in oklab, var(--amber) 30%, transparent)",
            borderRadius: 6,
            padding: "6px 8px",
          }}
        >
          {disqualifiedReason}
        </Text>
      )}
    </Flex>
  </Surface>
);
