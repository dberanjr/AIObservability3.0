import React, { useMemo, useState } from "react";
import { StatTile } from "../../components/StatTile";
import { Sparkline } from "../../components/charts/Sparkline";
import { EstimatedBadge } from "../../components/DetailModal";
import {
  useBedrockOverview,
  useBedrockCost,
  useBedrockPerf,
  useAgentSessions,
} from "../../bedrock/useBedrock";
import type { BedrockScope } from "../../bedrock/types";
import type { Timeframe } from "../../scope/types";
import type { PerfByModelRow } from "../../bedrock/parse";
import { fmtCount, fmtCountCompact, fmtMs, fmtPercent, fmtTokens, fmtUSDPrecise } from "../../data/format";
import { BedrockTileModal, type BedrockTileKind } from "./BedrockTileModal";
import { windowDays } from "../../scope/chartInterval";

export interface BedrockKpiRowProps {
  scope: BedrockScope;
}

/** Compact time-basis label for the StatTile "window" chip, derived from the
 *  scope's relative timeframe (e.g. "now()-24h" → "24h"). Falls back to
 *  "scope" for absolute / brush-zoomed ranges, which don't reduce to one
 *  round duration. */
const windowLabel = (tf: Timeframe): string => {
  const m = /^now\(\)-(\d+)([smhd])$/i.exec(tf.from);
  if (m && (!tf.to || tf.to === "now()")) return `${m[1]}${m[2].toLowerCase()}`;
  return "scope";
};

const GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "var(--d-gap)",
};

/** A sparkline is only worth rendering when the series actually shows a
 *  trend — an all-zero (or near-empty) array would draw a flat, meaningless
 *  line, so require at least 2 non-zero buckets. */
const hasSignal = (values: number[]): boolean => values.filter((v) => v !== 0).length >= 2;

/**
 * Golden-signal KPI row (D3): 8 StatTiles reading from the D2 hooks
 * (useBedrockOverview / useBedrockCost / useBedrockPerf / useAgentSessions),
 * each with an honest `info` tooltip — what the number is, how it's computed,
 * and, where the underlying signal is a metric-average rather than a true
 * percentile / error-rate / user-count, the caveat that keeps it from being
 * over-read (P95 latency, TTFT, Error rate, TPM headroom, Sessions all carry
 * one).
 *
 * Sparklines: "Est cost" plots its real daily cost series (`useBedrockCost`).
 * "Invocations", "Tokens", "Latency (avg)", "TTFT" and "Peak TPM" plot
 * `useBedrockPerf`'s `series` — a fine-grained (`pickChartIntervalSec`)
 * cross-model fold of the same metric timeseries each tile's headline number
 * derives from (see `aggregatePerfSeries` in parse.ts), so the trend is an
 * honest zoom-in on the same signal, not a fabricated one. "Error rate" has
 * no metric series (its only signal is the log `errorCode` field, which
 * arrives as a scope-aggregated total, not a timeseries) and "Sessions"
 * (a distinct-count) has no meaningful sparkline shape either — both are
 * deliberately left without one.
 *
 * Modal open-state lives here (not lifted to BedrockPage) since this row is
 * both the only producer and only consumer of which tile is drilled into.
 */
export const BedrockKpiRow = ({ scope }: BedrockKpiRowProps) => {
  const [modal, setModal] = useState<null | BedrockTileKind>(null);

  const { totals, isLoading: overviewLoading } = useBedrockOverview(scope);
  const { daily, summary, isLoading: costLoading } = useBedrockCost(scope);
  const { rows: perfRows, tpmPeakPct, series: perfSeries, isLoading: perfLoading } = useBedrockPerf(scope);
  const { rows: sessionRows } = useAgentSessions(scope);
  // Invocations/Tokens headline numbers come from the SCOPED overview logs, but
  // their sparklines come from the (account/model-unscoped) metric series — so
  // hide those two sparklines when a scope filter is active, to avoid a scoped
  // number sitting over an all-models trend. Latency/TTFT/TPM are metric-sourced
  // for both the number AND the spark, so they stay internally consistent.
  const scoped = scope.accounts.length > 0 || scope.models.length > 0;

  // Skeletons only before each hook's FIRST successful load (not on every
  // scope refetch) — mirrors BedrockHero's initialLoading guard.
  const overviewInitial = overviewLoading && totals.invocations === 0;
  const costInitial = costLoading && daily.length === 0;
  const perfInitial = perfLoading && perfRows.length === 0;

  const win = windowLabel(scope.timeframe);

  const errorRatePct = totals.invocations > 0 ? (totals.errors / totals.invocations) * 100 : 0;

  const worstLatencyRow = useMemo<PerfByModelRow | undefined>(
    () =>
      perfRows.reduce<PerfByModelRow | undefined>(
        (acc, r) => (acc == null || r.latencyMs > acc.latencyMs ? r : acc),
        undefined,
      ),
    [perfRows],
  );

  const totalTtftInvocations = perfRows.reduce((s, r) => s + r.invocations, 0);
  const ttftValue =
    totalTtftInvocations > 0
      ? perfRows.reduce((s, r) => s + r.ttftMs * r.invocations, 0) / totalTtftInvocations
      : 0;

  const avgInvPerSession = totals.sessions > 0 ? totals.invocations / totals.sessions : undefined;

  const costSub =
    summary.estimated > 0
      ? `${fmtUSDPrecise(summary.priced)} priced · ${fmtUSDPrecise(summary.estimated)} est.`
      : summary.total > 0
        ? "fully priced"
        : undefined;

  return (
    <>
      <div style={GRID}>
        <StatTile
          label="Invocations"
          value={fmtCount(totals.invocations)}
          sub={`${fmtCount(totals.models)} models · ${fmtCount(totals.accounts)} accounts`}
          info="Count of Bedrock model-invocation log rows in scope (/aws/bedrock/model-invocations), one per InvokeModel / Converse call — not sampled."
          window={win}
          loading={overviewInitial}
          onClick={() => setModal("invocations")}
          actionLabel="Open Invocations details"
          media={
            !scoped && hasSignal(perfSeries.invocations) ? (
              <Sparkline
                values={perfSeries.invocations}
                color="var(--blue)"
                height={28}
                valueFormatter={(n) => fmtCount(n)}
                ariaLabel="Invocations trend"
              />
            ) : undefined
          }
        />
        <StatTile
          label="Tokens"
          value={fmtTokens(totals.inTok + totals.outTok)}
          sub={`${fmtTokens(totals.inTok)} in / ${fmtTokens(totals.outTok)} out`}
          info="Input + output tokens summed across invocations in scope, read directly from the model-invocation log payload. Excludes cache-read/write tokens — see the Est cost breakdown for those."
          window={win}
          loading={overviewInitial}
          onClick={() => setModal("tokens")}
          actionLabel="Open Tokens details"
          media={
            !scoped && hasSignal(perfSeries.tokens) ? (
              <Sparkline
                values={perfSeries.tokens}
                color="var(--blue)"
                height={28}
                valueFormatter={(n) => fmtTokens(n)}
                ariaLabel="Tokens trend"
              />
            ) : undefined
          }
        />
        <StatTile
          label="Est cost"
          value={fmtUSDPrecise(summary.total)}
          sub={costSub}
          info="USD spend for Bedrock calls in scope. Cost = Σ(input×in-rate + output×out-rate + cache-read×cache-rate) per model, using the Models rate card (platform: AWS Bedrock). Unpriced models fall back to a blended rate, flagged 'est'."
          headerRight={summary.estimated > 0 ? <EstimatedBadge /> : undefined}
          window={win}
          loading={costInitial}
          onClick={() => setModal("cost")}
          actionLabel="Open Est cost details"
          media={
            daily.length > 1 ? (
              <Sparkline
                values={daily.map((d) => d.actual)}
                labels={daily.map((d) => d.day)}
                color="var(--blue)"
                height={28}
                valueFormatter={(n) => fmtUSDPrecise(n)}
                ariaLabel="Daily Bedrock spend"
              />
            ) : undefined
          }
        />
        <StatTile
          label="Latency (avg)"
          value={worstLatencyRow ? fmtMs(worstLatencyRow.latencyMs) : "—"}
          sub={worstLatencyRow?.model}
          info="Highest average per-model invocation latency observed in scope (cloud.aws.bedrock.InvocationLatency). This is per-model and avg-based — NOT a true percentile across individual invocations, and can't be split by user or session."
          window={win}
          loading={perfInitial}
          onClick={() => setModal("latency")}
          actionLabel="Open Latency (avg) details"
          media={
            hasSignal(perfSeries.latencyMs) ? (
              <Sparkline
                values={perfSeries.latencyMs}
                color="var(--blue)"
                height={28}
                valueFormatter={(n) => fmtMs(n)}
                ariaLabel="Latency trend"
              />
            ) : undefined
          }
        />
        <StatTile
          label="TTFT"
          value={totalTtftInvocations > 0 ? fmtMs(ttftValue) : "—"}
          sub="invocation-weighted avg"
          info="Invocation-weighted average time-to-first-token across models in scope (cloud.aws.bedrock.TimeToFirstToken), metric-derived from per-model bucket averages — not per-invocation values."
          window={win}
          loading={perfInitial}
          onClick={() => setModal("ttft")}
          actionLabel="Open TTFT details"
          media={
            hasSignal(perfSeries.ttftMs) ? (
              <Sparkline
                values={perfSeries.ttftMs}
                color="var(--blue)"
                height={28}
                valueFormatter={(n) => fmtMs(n)}
                ariaLabel="TTFT trend"
              />
            ) : undefined
          }
        />
        <StatTile
          label="Error rate"
          value={fmtPercent(errorRatePct)}
          sub={`${fmtCount(totals.errors)} / ${fmtCount(totals.invocations)}`}
          info="Share of invocations whose log row carries a non-null errorCode. Sourced from the log errorCode field only — doesn't capture logical failures (e.g. content-filtered responses with no error code), so this typically reads well under 1% and is a floor, not a full error rate."
          window={win}
          loading={overviewInitial}
          onClick={() => setModal("errors")}
          actionLabel="Open Error rate details"
        />
        <StatTile
          label="Peak TPM"
          value={fmtCountCompact(tpmPeakPct)}
          sub="tok/min (peak)"
          info="Peak estimated tokens-per-minute against the account's Bedrock quota in scope (cloud.aws.bedrock.EstimatedTPMQuotaUsage). This is an ABSOLUTE tokens/min rate, not a percentage — expressing it as % of quota needs the per-model quota ceiling, which isn't ingested. See the per-model TPM breakdown on this tab."
          window={win}
          loading={perfInitial}
          onClick={() => setModal("tpm")}
          actionLabel="Open Peak TPM details"
          media={
            hasSignal(perfSeries.tpm) ? (
              <Sparkline
                values={perfSeries.tpm}
                color="var(--blue)"
                height={28}
                valueFormatter={(n) => fmtCountCompact(n)}
                ariaLabel="Peak TPM trend"
              />
            ) : undefined
          }
        />
        <StatTile
          label="Sessions"
          value={fmtCount(totals.sessions)}
          sub={avgInvPerSession != null ? `${avgInvPerSession.toFixed(1)} inv/session avg` : undefined}
          info="Distinct agent-session identities in scope, derived from the last path segment of the invocation identity ARN — not human users. Multiple invocations sharing the same ARN suffix count as one session."
          window={win}
          loading={overviewInitial}
          onClick={() => setModal("sessions")}
          actionLabel="Open Sessions details"
        />
      </div>

      {modal && (
        <BedrockTileModal
          kind={modal}
          onClose={() => setModal(null)}
          totals={totals}
          daily={daily}
          costSummary={summary}
          windowDays={windowDays(scope.timeframe.from)}
          perfRows={perfRows}
          tpmPeakPct={tpmPeakPct}
          sessionRows={sessionRows}
        />
      )}
    </>
  );
};
