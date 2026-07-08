import React, { useMemo } from "react";
import { Text } from "@dynatrace/strato-components/typography";
import {
  DetailModalShell,
  Section,
  Stat,
  StatGrid,
} from "../../components/DetailModal";
import { AreaChart, type AxisTick } from "../../components/charts/AreaChart";
import { BarList, type BarListItem } from "../../components/charts/BarList";
import {
  fmtCount,
  fmtMs,
  fmtPercent,
  fmtTokens,
  fmtUSD,
  fmtUSDCents,
} from "../../data/format";
import type { OverviewTotals, PerfByModelRow, AgentSessionRow } from "../../bedrock/parse";
import type { BedrockDailyCostPoint } from "../../bedrock/series";
import type { BedrockCostSummary } from "../../bedrock/cost";

export type BedrockTileKind =
  | "invocations"
  | "tokens"
  | "cost"
  | "latency"
  | "ttft"
  | "errors"
  | "tpm"
  | "sessions";

export interface BedrockTileModalProps {
  kind: BedrockTileKind;
  onClose: () => void;
  totals: OverviewTotals;
  daily: BedrockDailyCostPoint[];
  costSummary: BedrockCostSummary;
  perfRows: PerfByModelRow[];
  tpmPeakPct: number;
  sessionRows: AgentSessionRow[];
}

const MODAL_META: Record<BedrockTileKind, { title: string; subtitle: string }> = {
  invocations: {
    title: "Invocations",
    subtitle: "Bedrock model-invocation volume in the current scope",
  },
  tokens: {
    title: "Tokens",
    subtitle: "Input, output, and cache token volume in the current scope",
  },
  cost: {
    title: "Estimated cost",
    subtitle: "Spend breakdown — over time, by model, by session, and token mix",
  },
  latency: {
    title: "P95 latency",
    subtitle:
      "Highest per-model average invocation latency in scope — metric-derived, not a true percentile",
  },
  ttft: {
    title: "Time to first token",
    subtitle: "Invocation-weighted average TTFT by model in scope",
  },
  errors: {
    title: "Error rate",
    subtitle: "Invocations whose log row carries a non-null errorCode",
  },
  tpm: {
    title: "TPM headroom",
    subtitle: "Peak observed usage of the account's tokens-per-minute quota",
  },
  sessions: {
    title: "Sessions",
    subtitle: "Distinct agent-session identities derived from the invocation ARN",
  },
};

/**
 * Golden-signal tile drill-down (D3). One shared modal keyed by `kind` so the
 * KPI row owns a single piece of state instead of 8 separate modals. `cost`
 * gets the full breakdown the brief calls for (stat strip, spend-over-time,
 * by-model, by-session, token mix, and a "how it's calculated" footer); the
 * other 7 kinds stay to a StatGrid (+ a by-model BarList for latency/ttft,
 * where a per-model series actually exists in `perfRows`) — deliberately not
 * over-built to match data that's actually available from the D2 hooks.
 *
 * By-account cost breakdown is NOT included in THIS modal: it was out of
 * scope for D3 (scoped to the 4 hooks that existed in useBedrock.ts at the
 * time — see the D3 report for that deferral). D4 later wired
 * `useBedrockAccountCost` onto `buildAccountModelQuery` and surfaces a
 * by-account BarList in the page-level BedrockCostZone instead.
 */
export const BedrockTileModal = ({
  kind,
  onClose,
  totals,
  daily,
  costSummary,
  perfRows,
  tpmPeakPct,
  sessionRows,
}: BedrockTileModalProps) => {
  const meta = MODAL_META[kind];

  // ---- cost-only derived data -------------------------------------------
  const dayCount = Math.max(1, daily.length);
  const projected30d = (costSummary.total * 30) / dayCount;
  const avgPerInvocationCents =
    totals.invocations > 0 ? (costSummary.total / totals.invocations) * 100 : 0;

  const dailyAxisTicks = useMemo<AxisTick[]>(() => {
    const len = daily.length;
    if (len <= 1) return [];
    const tickCount = Math.min(6, len);
    return Array.from({ length: tickCount }, (_, k) => {
      const idx = Math.round((k / (tickCount - 1)) * (len - 1));
      return { index: idx, label: daily[idx]?.day ?? "" };
    });
  }, [daily]);

  const byModelItems = useMemo<BarListItem[]>(() => {
    const sums: Record<string, number> = {};
    for (const day of daily) {
      for (const [model, value] of Object.entries(day.byModel)) {
        sums[model] = (sums[model] ?? 0) + value;
      }
    }
    return Object.entries(sums)
      .sort((a, b) => b[1] - a[1])
      .map(([model, value]) => ({
        key: model,
        label: model,
        value,
        displayValue: fmtUSD(value),
      }));
  }, [daily]);

  const bySessionItems = useMemo<BarListItem[]>(
    () =>
      [...sessionRows]
        .sort((a, b) => b.estCost - a.estCost)
        .slice(0, 10)
        .map((r) => ({
          key: r.session || `${r.account}-unknown`,
          label: r.session || "(unknown session)",
          value: r.estCost,
          displayValue: fmtUSD(r.estCost),
          secondary: `${fmtCount(r.invocations)} inv · ${r.account || "unknown account"}${r.blended ? " · est. rate" : ""}`,
        })),
    [sessionRows],
  );

  const cacheTotal = totals.cacheRead + totals.cacheWrite;
  const splitItems: BarListItem[] = [
    { key: "input", label: "Input tokens", value: totals.inTok, displayValue: fmtTokens(totals.inTok) },
    { key: "output", label: "Output tokens", value: totals.outTok, displayValue: fmtTokens(totals.outTok) },
    {
      key: "cache",
      label: "Cache tokens",
      value: cacheTotal,
      displayValue: fmtTokens(cacheTotal),
      secondary: `${fmtTokens(totals.cacheRead)} read · ${fmtTokens(totals.cacheWrite)} write`,
    },
  ];
  const splitColor = (item: BarListItem): string =>
    item.key === "input" ? "var(--blue)" : item.key === "output" ? "var(--green-2)" : "var(--amber)";

  // ---- latency / ttft derived data --------------------------------------
  const byLatency = useMemo(() => [...perfRows].sort((a, b) => b.latencyMs - a.latencyMs), [perfRows]);
  const byTtft = useMemo(() => [...perfRows].sort((a, b) => b.ttftMs - a.ttftMs), [perfRows]);
  const avgLatency = perfRows.length
    ? perfRows.reduce((s, r) => s + r.latencyMs, 0) / perfRows.length
    : 0;
  const totalTtftInvocations = perfRows.reduce((s, r) => s + r.invocations, 0);
  const weightedTtft =
    totalTtftInvocations > 0
      ? perfRows.reduce((s, r) => s + r.ttftMs * r.invocations, 0) / totalTtftInvocations
      : 0;

  // ---- overview-derived data ---------------------------------------------
  const errorRatePct = totals.invocations > 0 ? (totals.errors / totals.invocations) * 100 : 0;
  const avgInvPerSession = totals.sessions > 0 ? totals.invocations / totals.sessions : 0;

  const renderBody = (): React.ReactNode => {
    switch (kind) {
      case "invocations":
        return (
          <StatGrid cols={3}>
            <Stat label="Invocations" value={fmtCount(totals.invocations)} emphasize />
            <Stat label="Accounts" value={fmtCount(totals.accounts)} />
            <Stat label="Models" value={fmtCount(totals.models)} />
            <Stat label="Sessions" value={fmtCount(totals.sessions)} />
            <Stat label="Errors" value={fmtCount(totals.errors)} />
            <Stat label="Error rate" value={fmtPercent(errorRatePct)} />
          </StatGrid>
        );

      case "tokens": {
        const inputSide = totals.inTok + totals.cacheRead;
        const cacheHitPct = inputSide > 0 ? (totals.cacheRead / inputSide) * 100 : 0;
        return (
          <StatGrid cols={3}>
            <Stat label="Input tokens" value={fmtTokens(totals.inTok)} emphasize />
            <Stat label="Output tokens" value={fmtTokens(totals.outTok)} />
            <Stat label="Total (in + out)" value={fmtTokens(totals.inTok + totals.outTok)} />
            <Stat label="Cache read" value={fmtTokens(totals.cacheRead)} />
            <Stat label="Cache write" value={fmtTokens(totals.cacheWrite)} />
            <Stat label="Cache hit rate" value={fmtPercent(cacheHitPct)} sub="of input-side tokens" />
          </StatGrid>
        );
      }

      case "cost":
        return (
          <>
            <Section title="Summary">
              <StatGrid cols={3}>
                <Stat label="Priced (rate card)" value={fmtUSD(costSummary.priced)} emphasize />
                <Stat
                  label="Estimated (fallback rate)"
                  value={fmtUSD(costSummary.estimated)}
                  sub={
                    costSummary.estimatedModels.length > 0
                      ? costSummary.estimatedModels.slice(0, 3).join(", ") +
                        (costSummary.estimatedModels.length > 3 ? "…" : "")
                      : undefined
                  }
                />
                <Stat label="Saved by cache" value={fmtUSD(costSummary.savedByCache)} />
                <Stat
                  label="30-day projection"
                  value={fmtUSD(projected30d)}
                  sub={`linear from ${dayCount}-day scope`}
                />
                <Stat label="Avg / invocation" value={fmtUSDCents(avgPerInvocationCents)} />
              </StatGrid>
            </Section>

            <Section title="Spend over time">
              {daily.length > 1 ? (
                <AreaChart
                  height={200}
                  series={[
                    { label: "Cost", color: "var(--blue)", values: daily.map((d) => d.actual), axis: "left" },
                  ]}
                  xLabels={daily.map((d) => d.day)}
                  axisTicks={dailyAxisTicks}
                  formatLeft={(n) => fmtUSD(n)}
                  ariaLabel="Daily Bedrock spend"
                />
              ) : (
                <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
                  Not enough daily data to chart in this scope.
                </Text>
              )}
            </Section>

            <Section title="By model">
              {byModelItems.length > 0 ? (
                <BarList items={byModelItems} limit={10} color="var(--blue)" />
              ) : (
                <Text style={{ fontSize: 12, color: "var(--text-3)" }}>No model spend in this scope.</Text>
              )}
            </Section>

            <Section title="By session (top by cost)">
              {bySessionItems.length > 0 ? (
                <BarList items={bySessionItems} limit={10} color="var(--blue)" />
              ) : (
                <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
                  No agent-session activity in this scope.
                </Text>
              )}
            </Section>

            <Section title="Token mix">
              <BarList items={splitItems} color={splitColor} />
            </Section>
          </>
        );

      case "latency":
        return (
          <>
            <StatGrid cols={3}>
              <Stat
                label="Highest (representative)"
                value={byLatency.length > 0 ? fmtMs(byLatency[0].latencyMs) : "—"}
                sub={byLatency[0]?.model}
                emphasize
              />
              <Stat label="Average across models" value={byLatency.length > 0 ? fmtMs(avgLatency) : "—"} />
              <Stat
                label="Lowest"
                value={byLatency.length > 0 ? fmtMs(byLatency[byLatency.length - 1].latencyMs) : "—"}
                sub={byLatency[byLatency.length - 1]?.model}
              />
            </StatGrid>
            <Section title="By model">
              {byLatency.length > 0 ? (
                <BarList
                  items={byLatency.map((r) => ({
                    key: r.model,
                    label: r.model,
                    value: r.latencyMs,
                    displayValue: fmtMs(r.latencyMs),
                    secondary: `${fmtCount(r.invocations)} invocations`,
                  }))}
                  limit={10}
                  color="var(--blue)"
                />
              ) : (
                <Text style={{ fontSize: 12, color: "var(--text-3)" }}>No per-model latency data in this scope.</Text>
              )}
            </Section>
          </>
        );

      case "ttft":
        return (
          <>
            <StatGrid cols={3}>
              <Stat
                label="Weighted average"
                value={totalTtftInvocations > 0 ? fmtMs(weightedTtft) : "—"}
                sub="invocation-weighted"
                emphasize
              />
              <Stat label="Highest" value={byTtft.length > 0 ? fmtMs(byTtft[0].ttftMs) : "—"} sub={byTtft[0]?.model} />
              <Stat
                label="Lowest"
                value={byTtft.length > 0 ? fmtMs(byTtft[byTtft.length - 1].ttftMs) : "—"}
                sub={byTtft[byTtft.length - 1]?.model}
              />
            </StatGrid>
            <Section title="By model">
              {byTtft.length > 0 ? (
                <BarList
                  items={byTtft.map((r) => ({
                    key: r.model,
                    label: r.model,
                    value: r.ttftMs,
                    displayValue: fmtMs(r.ttftMs),
                    secondary: `${fmtCount(r.invocations)} invocations`,
                  }))}
                  limit={10}
                  color="var(--blue)"
                />
              ) : (
                <Text style={{ fontSize: 12, color: "var(--text-3)" }}>No per-model TTFT data in this scope.</Text>
              )}
            </Section>
          </>
        );

      case "errors":
        return (
          <StatGrid cols={3}>
            <Stat label="Errors" value={fmtCount(totals.errors)} danger={totals.errors > 0} emphasize />
            <Stat label="Invocations" value={fmtCount(totals.invocations)} />
            <Stat label="Error rate" value={fmtPercent(errorRatePct)} sub="log errorCode only — a floor" />
          </StatGrid>
        );

      case "tpm":
        return (
          <StatGrid cols={2}>
            <Stat label="Peak TPM usage" value={fmtPercent(tpmPeakPct)} emphasize />
            <Stat label="Headroom remaining" value={fmtPercent(Math.max(0, 100 - tpmPeakPct))} sub="100% − peak usage" />
          </StatGrid>
        );

      case "sessions":
        return (
          <StatGrid cols={3}>
            <Stat label="Sessions" value={fmtCount(totals.sessions)} emphasize />
            <Stat label="Invocations / session (avg)" value={avgInvPerSession.toFixed(1)} />
            <Stat
              label="Tracked rows"
              value={fmtCount(sessionRows.length)}
              sub="top sessions by volume, capped at 200"
            />
          </StatGrid>
        );

      default:
        return null;
    }
  };

  return (
    <DetailModalShell
      title={meta.title}
      subtitle={meta.subtitle}
      onClose={onClose}
      footer={
        kind === "cost" ? (
          <Text style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
            Cost = Σ(input×in-rate + output×out-rate + cache-read×cache-rate) per model, priced from
            the Models rate card (platform: AWS Bedrock). Cache-write tokens price separately where
            the rate card defines a write rate. "Saved by cache" compares actual cost to a
            counterfactual where every cache-read token was re-priced as full-cost input.
            {costSummary.estimatedModels.length > 0 && (
              <>
                {" "}
                Unpriced, estimated at a blended fallback rate: {costSummary.estimatedModels.join(", ")}.
              </>
            )}
          </Text>
        ) : undefined
      }
    >
      {renderBody()}
    </DetailModalShell>
  );
};
