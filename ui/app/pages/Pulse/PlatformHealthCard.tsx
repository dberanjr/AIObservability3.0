import React, { useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Skeleton } from "@dynatrace/strato-components/content";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  HeartIcon,
  MoneyIcon,
  TargetFilledIcon,
} from "@dynatrace/strato-icons";
import { fmtCount, fmtMs, fmtPercent } from "../../data/format";
import type { Pillar, PillarStatus, PulseHealth } from "./types";
import {
  useHealthContributors,
  type Contributor,
} from "./useHealthContributors";

const STATUS_COLOR: Record<PillarStatus, string> = {
  good: "var(--green-2)",
  warning: "var(--amber)",
  critical: "var(--red)",
  "no-data": "var(--text-4)",
};

const STATUS_LABEL: Record<PillarStatus, string> = {
  good: "Healthy",
  warning: "Degraded",
  critical: "Critical",
  "no-data": "No data",
};

const PILLAR_ICON = {
  operational: TargetFilledIcon,
  quality: HeartIcon,
  cost: MoneyIcon,
} as const;

const StatusDot = ({ status }: { status: PillarStatus }) => (
  <span
    aria-hidden
    style={{
      display: "inline-block",
      width: 10,
      height: 10,
      borderRadius: "50%",
      background: STATUS_COLOR[status],
      boxShadow:
        status === "critical"
          ? `0 0 0 4px color-mix(in oklab, ${STATUS_COLOR.critical} 25%, transparent)`
          : undefined,
    }}
  />
);

const ScoreDisplay = ({ score }: { score: number | null }) => (
  <Flex alignItems="baseline" gap={4}>
    <Text
      style={{
        fontFamily: "var(--mono, monospace)",
        fontSize: 32,
        fontWeight: 600,
        lineHeight: 1,
        color: "var(--text)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {score == null ? "—" : score}
    </Text>
    {score != null && (
      <Text style={{ fontSize: 12, color: "var(--text-3)" }}>/ 100</Text>
    )}
  </Flex>
);

const PillarColumn = ({ pillar }: { pillar: Pillar }) => {
  const Icon = PILLAR_ICON[pillar.key];
  return (
    <Flex flexDirection="column" gap={12} style={{ flex: 1, minWidth: 0 }}>
      <Flex alignItems="center" gap={8}>
        <Icon size={16} style={{ color: "var(--text-2)" }} />
        <Text
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}
        >
          {pillar.label}
        </Text>
      </Flex>

      <Flex alignItems="center" gap={8}>
        <StatusDot status={pillar.status} />
        <Text style={{ fontSize: 12, color: "var(--text-2)" }}>
          {STATUS_LABEL[pillar.status]}
        </Text>
      </Flex>

      <ScoreDisplay score={pillar.score} />

      <Flex flexDirection="column" gap={6}>
        {pillar.reasons.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            No signals available yet.
          </Text>
        ) : (
          pillar.reasons.map((r, i) => (
            <Flex key={i} alignItems="flex-start" gap={6}>
              <span
                aria-hidden
                style={{
                  flex: "0 0 auto",
                  marginTop: 6,
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background:
                    r.intent === "critical"
                      ? "var(--red)"
                      : r.intent === "warning"
                        ? "var(--amber)"
                        : "var(--text-3)",
                }}
              />
              <Text style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                {r.text}
              </Text>
            </Flex>
          ))
        )}
      </Flex>

      {pillar.cta && (
        <Flex>
          <Button
            as="a"
            href={pillar.cta.href}
            target="_blank"
            rel="noopener noreferrer"
            variant="default"
          >
            {pillar.cta.label}
          </Button>
        </Flex>
      )}
    </Flex>
  );
};

const Divider = () => (
  <div
    aria-hidden
    style={{
      width: 1,
      alignSelf: "stretch",
      background: "var(--border)",
      flex: "0 0 auto",
    }}
  />
);

const ContributorList = ({
  title,
  rows,
  metric,
}: {
  title: string;
  rows: Contributor[];
  metric: "p95" | "error";
}) => (
  <Flex flexDirection="column" gap={4} style={{ flex: 1, minWidth: 180 }}>
    <Text
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color: "var(--text-3)",
      }}
    >
      {title}
    </Text>
    {rows.length === 0 ? (
      <Text style={{ fontSize: 11.5, color: "var(--text-4)" }}>None</Text>
    ) : (
      rows.map((r) => (
        <Flex key={r.name} alignItems="center" justifyContent="space-between" gap={8}>
          <Text
            style={{
              fontSize: 12,
              fontFamily: "var(--mono, monospace)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={r.name}
          >
            {r.name}
          </Text>
          <Text
            style={{
              fontSize: 12,
              fontVariantNumeric: "tabular-nums",
              color:
                metric === "error" ? "var(--red)" : "var(--text-2)",
              flex: "0 0 auto",
            }}
          >
            {metric === "error"
              ? fmtPercent(r.errorRatePct ?? 0)
              : `${fmtMs(r.p95Ms)} · ${fmtCount(r.calls)}`}
          </Text>
        </Flex>
      ))
    )}
  </Flex>
);

const HealthDrilldown = () => {
  const { slowAgents, slowModels, errorAgents, isLoading } =
    useHealthContributors();
  if (isLoading) {
    return <Skeleton style={{ height: 60 }} />;
  }
  return (
    <Flex gap={24} style={{ flexWrap: "wrap" }}>
      <ContributorList title="Slowest agents (P95 · calls)" rows={slowAgents} metric="p95" />
      <ContributorList title="Slowest models (P95 · calls)" rows={slowModels} metric="p95" />
      <ContributorList title="Highest error rate" rows={errorAgents} metric="error" />
    </Flex>
  );
};

export interface PlatformHealthCardProps {
  health: PulseHealth;
}

export const PlatformHealthCard = ({ health }: PlatformHealthCardProps) => {
  const [open, setOpen] = useState(false);
  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="baseline" justifyContent="space-between">
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Platform health
          </Heading>
          <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
            Surfaced by Dynatrace Intelligence
          </Text>
        </Flex>

        {health.isLoading ? (
          <Flex gap={24}>
            {[0, 1, 2].map((i) => (
              <Flex
                key={i}
                flexDirection="column"
                gap={8}
                style={{ flex: 1, minWidth: 0 }}
              >
                <Skeleton style={{ height: 12, width: 80 }} />
                <Skeleton style={{ height: 32, width: 100 }} />
                <Skeleton style={{ height: 12, width: "100%" }} />
                <Skeleton style={{ height: 12, width: "80%" }} />
              </Flex>
            ))}
          </Flex>
        ) : (
          <Flex gap={24} alignItems="stretch">
            <PillarColumn pillar={health.operational} />
            <Divider />
            <PillarColumn pillar={health.quality} />
            <Divider />
            <PillarColumn pillar={health.cost} />
          </Flex>
        )}

        {!health.isLoading && (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              style={{
                all: "unset",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: "var(--blue)",
                borderTop: "1px solid var(--border)",
                paddingTop: 10,
              }}
            >
              {open ? (
                <ChevronDownIcon size={14} />
              ) : (
                <ChevronRightIcon size={14} />
              )}
              What's contributing
            </button>
            {open && <HealthDrilldown />}
          </>
        )}
      </Flex>
    </Surface>
  );
};
