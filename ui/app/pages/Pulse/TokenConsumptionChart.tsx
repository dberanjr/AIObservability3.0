import React, { useCallback, useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import {
  AreaChart,
  type AxisTick,
  type ChartTimeDomain,
  type ForecastBand,
} from "../../components/charts/AreaChart";
import {
  ChartModal,
  useChartExpander,
} from "../../components/charts/ChartExpander";
import { ForecastToggle } from "../../components/charts/ForecastToggle";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import {
  EmptyState,
  emptyCause,
  type EmptyStateAction,
} from "../../components/EmptyState";
import { fmtTokens, fmtUSDCompact } from "../../data/format";
import { useScope } from "../../scope/ScopeContext";
import { TIME_PRESETS } from "../../scope/types";
import {
  SCAN_LIMITS_GB,
  SCAN_LIMIT_LABELS,
  useScanLimit,
} from "../../scope/ScanLimitContext";
import {
  ScanScope,
  useScanGroup,
  useScanScope,
} from "../../scope/ScanReportContext";
import { intervalPhraseFromMs } from "../../scope/chartInterval";
import { costOf } from "../../data/pricing";
import { usePersistedState } from "../../state/usePersistedState";
import { useTokenConsumption } from "./useTokenConsumption";
import { useTokenForecast } from "./useTokenForecast";
import { useSpendBreakdown } from "./useSpendBreakdown";

/**
 * Build labels for every bucket on the combined (history + forecast) axis.
 * Historical positions get "Xm ago" / "Xh ago"; forecast positions get
 * "+Xm" / "+Xh" so the cursor tooltip stays oriented.
 */
const buildLabels = (
  historicalCount: number,
  intervalMs: number,
  forecastCount: number,
): string[] => {
  const totalMs = historicalCount * intervalMs;
  const out: string[] = [];
  for (let i = 0; i < historicalCount; i++) {
    const agoMs = totalMs - i * intervalMs;
    if (agoMs < 60_000) out.push("just now");
    else if (agoMs < 3_600_000) out.push(`${Math.round(agoMs / 60_000)}m ago`);
    else if (agoMs < 86_400_000) out.push(`${Math.round(agoMs / 3_600_000)}h ago`);
    else out.push(`${Math.round(agoMs / 86_400_000)}d ago`);
  }
  for (let i = 1; i <= forecastCount; i++) {
    const aheadMs = i * intervalMs;
    if (aheadMs < 3_600_000) out.push(`+${Math.round(aheadMs / 60_000)}m`);
    else if (aheadMs < 86_400_000) out.push(`+${Math.round(aheadMs / 3_600_000)}h`);
    else out.push(`+${Math.round(aheadMs / 86_400_000)}d`);
  }
  return out;
};

/**
 * Pick `targetCount` evenly-spaced bucket indices for x-axis tick labels.
 * Format depends on the total span: time-of-day for <=24h windows,
 * month/day-with-time for multi-day windows.
 */
const buildAxisTicks = (
  historicalCount: number,
  intervalMs: number,
  forecastCount: number,
  targetCount = 6,
): AxisTick[] => {
  const totalBuckets = historicalCount + forecastCount;
  if (totalBuckets < 2) return [];
  const now = Date.now();
  // Bucket i corresponds to: now - (historicalCount - i) * intervalMs.
  // Forecast bucket j (j >= historicalCount) is in the future.
  const totalSpanMs = totalBuckets * intervalMs;
  const multiDay = totalSpanMs >= 24 * 60 * 60 * 1000;
  const tsFmt = new Intl.DateTimeFormat(undefined, {
    ...(multiDay
      ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
      : { hour: "numeric", minute: "2-digit" }),
  });
  const ticks: AxisTick[] = [];
  for (let k = 0; k < targetCount; k++) {
    const index = Math.round((k / (targetCount - 1)) * (totalBuckets - 1));
    const offsetFromNowMs = (index - historicalCount) * intervalMs;
    const ts = now + offsetFromNowMs;
    ticks.push({ index, label: tsFmt.format(new Date(ts)) });
  }
  return ticks;
};

const TokenConsumptionBody = ({ showExample = false }: { showExample?: boolean }) => {
  const result = useTokenConsumption(showExample);
  // Read this panel's own scan telemetry (tagged by the enclosing <ScanScope>)
  // so a truncated scan surfaces the amber "Scan budget reached" empty rather
  // than a misleading "no activity" (STATE-4).
  const limitHit = useScanGroup(useScanScope())?.limitHit ?? false;
  const emptyKind = emptyCause({ error: result.error, limitHit });
  const [forecastEnabled, onToggleForecast] = usePersistedState<boolean>(
    "ai-obs.pulse.forecast-enabled",
    false,
  );
  const forecast = useTokenForecast(forecastEnabled, showExample);
  const { scope, setTimeframe } = useScope();
  const spend = useSpendBreakdown(showExample);
  // Empty-state remedies wired to the real scope / scan-limit setters, so a
  // scope-driven empty offers one-click widen / raise instead of inert prose
  // (STATE-6). A truncated scan skips "widen" (that scans MORE); an error offers
  // neither. Buttons disable themselves at the widest preset / max scan budget.
  const { scanLimitGb, setScanLimit } = useScanLimit();
  const tfOrder = TIME_PRESETS.map((p) => p.value);
  const tfIdx = tfOrder.indexOf(scope.timeframe.from);
  const nextTf =
    tfIdx === -1 ? "now()-24h" : tfIdx < tfOrder.length - 1 ? tfOrder[tfIdx + 1] : null;
  const widenTimeframe = nextTf ? () => setTimeframe({ from: nextTf }) : undefined;
  const scanIdx = SCAN_LIMITS_GB.indexOf(scanLimitGb);
  const nextScan =
    scanIdx >= 0 && scanIdx < SCAN_LIMITS_GB.length - 1 ? SCAN_LIMITS_GB[scanIdx + 1] : null;
  const raiseScanLimit = nextScan != null ? () => setScanLimit(nextScan) : undefined;
  const raiseScanLabel =
    nextScan != null ? `Raise scan limit to ${SCAN_LIMIT_LABELS[nextScan]}` : "Scan limit at max";
  const remedyActions: EmptyStateAction[] =
    emptyKind === "error"
      ? []
      : emptyKind === "truncated"
        ? [{ label: raiseScanLabel, onClick: raiseScanLimit }]
        : [
            { label: "Widen timeframe", onClick: widenTimeframe },
            { label: raiseScanLabel, onClick: raiseScanLimit },
          ];
  const spendTotal = !spend.isLoading && spend.total > 0 ? spend.total : result.totalCost;
  // Reconcile the per-bucket cost to the ACTUAL fleet spend. The raw per-bucket
  // estCost is a blended estimate; scale it so the dashed cost line's total
  // matches the accurate (per-model) spend figure shown beside the chart,
  // distributed across intervals by token share. (True per-model-per-bucket cost
  // would need a per-model time query.)
  const costScale =
    result.totalCost > 0 && spendTotal > 0 ? spendTotal / result.totalCost : 1;
  const intervalPhrase = intervalPhraseFromMs(result.intervalMs);
  const historicalTokens = result.points.map((p) => p.tokens);
  const historicalCosts = result.points.map((p) => p.estCost * costScale);
  const histLen = historicalTokens.length;
  const fc = forecast.forecast;
  const forecastLen = forecastEnabled && fc ? fc.values.length : 0;

  // Null-pad the historical series into forecast positions so the cursor
  // tooltip skips them (a `0` padding would show a misleading "Tokens 0"
  // / "Est. cost $0" line in the forecast region) and the line/area don't
  // draw a flat tail across the divider.
  const tokensCombined = useMemo<(number | null)[]>(
    () =>
      (historicalTokens as (number | null)[]).concat(
        new Array(forecastLen).fill(null),
      ),
    [historicalTokens, forecastLen],
  );
  const costsCombined = useMemo<(number | null)[]>(
    () =>
      (historicalCosts as (number | null)[]).concat(
        new Array(forecastLen).fill(null),
      ),
    [historicalCosts, forecastLen],
  );

  const xLabels = useMemo(
    () => buildLabels(histLen, result.intervalMs, forecastLen),
    [histLen, result.intervalMs, forecastLen],
  );

  const axisTicks = useMemo(
    () => buildAxisTicks(histLen, result.intervalMs, forecastLen, 6),
    [histLen, result.intervalMs, forecastLen],
  );

  // Forecasted per-bucket cost, reconciled to the actual spend rate (costScale)
  // exactly like the historical Est. cost line, so the forecast cost band tracks
  // the forecast token band on the same scale.
  const tokensToCost = useCallback(
    (n: number) => costOf(n / 2, n / 2, null) * costScale,
    [costScale],
  );

  const forecastBands: ForecastBand[] = useMemo(() => {
    if (!forecastEnabled || !fc || histLen === 0) return [];
    const leadingNulls = new Array<number | null>(histLen).fill(null);
    const mapCost = (arr: number[]): (number | null)[] =>
      leadingNulls.concat(arr.map((v) => tokensToCost(v)));

    return [
      {
        values: leadingNulls.concat(fc.values),
        lower: leadingNulls.concat(fc.lower),
        upper: leadingNulls.concat(fc.upper),
        startIdx: histLen,
        color: "var(--purple-2)",
        label: "Forecast tokens",
        axis: "left",
      },
      {
        values: mapCost(fc.values),
        lower: mapCost(fc.lower),
        upper: mapCost(fc.upper),
        startIdx: histLen,
        color: "var(--pink)",
        label: "Forecast cost",
        axis: "right",
      },
    ];
  }, [forecastEnabled, fc, histLen, tokensToCost]);

  // Time domain spans `now - histLen*intervalMs` (historical start) through
  // the last forecast bucket if present, otherwise `now`. Brush emits ISO
  // timestamps so the resulting scope is fully reproducible.
  const xDomain: ChartTimeDomain | undefined = useMemo(() => {
    if (histLen === 0) return undefined;
    const now = Date.now();
    const startMs = now - histLen * result.intervalMs;
    const endMs = now + forecastLen * result.intervalMs;
    return { startMs, endMs };
  }, [histLen, forecastLen, result.intervalMs]);

  const expander = useChartExpander();

  // Summary stats for the modal: derived from the historical token series
  // so they aren't biased by the forecast tail when it's on.
  const stats = useMemo(() => {
    if (historicalTokens.length === 0) return [];
    const nonEmpty = historicalTokens.filter((v) => Number.isFinite(v));
    const min = nonEmpty.reduce((a, b) => Math.min(a, b), Infinity);
    const max = nonEmpty.reduce((a, b) => Math.max(a, b), -Infinity);
    const avg = nonEmpty.reduce((a, b) => a + b, 0) / Math.max(1, nonEmpty.length);
    const sorted = [...nonEmpty].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    return [
      { label: "Total tokens", value: fmtTokens(result.totalTokens) },
      { label: "Total est. cost", value: fmtUSDCompact(result.totalCost) },
      { label: `Min per ${intervalPhrase}`, value: fmtTokens(min) },
      { label: `Median per ${intervalPhrase}`, value: fmtTokens(median) },
      { label: `Avg per ${intervalPhrase}`, value: fmtTokens(avg) },
      { label: `Peak per ${intervalPhrase}`, value: fmtTokens(max) },
    ];
  }, [historicalTokens, result.totalTokens, result.totalCost, intervalPhrase]);

  const chart = (chartHeight: number) => (
    <AreaChart
      height={chartHeight}
      ariaLabel={`Token consumption per ${intervalPhrase}, with estimated cost (reconciled to actual spend) on the right axis`}
      formatLeft={(n) => fmtTokens(n)}
      formatRight={(n) => fmtUSDCompact(n)}
      xLabels={xLabels}
      axisTicks={axisTicks}
      forecasts={forecastBands}
      xDomain={xDomain}
      onBrushSelect={(range) => setTimeframe(range)}
      series={[
        {
          label: "Tokens",
          color: "var(--blue)",
          values: tokensCombined,
          axis: "left",
        },
        {
          label: "Est. cost",
          color: "var(--purple)",
          values: costsCombined,
          axis: "right",
          dashed: true,
        },
      ]}
    />
  );

  return (
      <Flex flexDirection="column" gap={12} style={{ padding: 16 }}>
        <Flex alignItems="baseline" justifyContent="space-between">
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Tokens (solid) · Est. cost (dashed, right axis) · per {intervalPhrase}
            {forecastEnabled ? " · Forecast (dashed purple)" : ""}
          </Text>
          <Flex alignItems="center" gap={12}>
            <Text style={{ fontSize: 11.5, color: "var(--text-2)" }}>
              <strong>{fmtTokens(result.totalTokens)}</strong> tokens
            </Text>
            <Text style={{ fontSize: 11.5, color: "var(--text-2)" }}>
              <strong>{fmtUSDCompact(spendTotal)}</strong> spend
              {spend.hasEstimated && !spend.isLoading
                ? ` · ${fmtUSDCompact(spend.actual)} actual + ${fmtUSDCompact(spend.estimated)} est.`
                : ""}
            </Text>
            <ForecastToggle
              enabled={forecastEnabled}
              loading={forecast.isLoading}
              error={forecast.error}
              onChange={onToggleForecast}
            />
            {expander.expandButton("Expand token consumption chart")}
          </Flex>
        </Flex>

        {result.isLoading ? (
          <Skeleton style={{ height: 220 }} />
        ) : result.points.length === 0 ? (
          <EmptyState
            bare
            cause={emptyKind}
            title={
              emptyKind === "no-activity"
                ? "No data in the current scope."
                : undefined
            }
            hint="gen_ai.usage.input_tokens · gen_ai.usage.output_tokens"
            actions={remedyActions}
          />
        ) : (
          // Render the inline chart through the SAME builder as the expanded
          // modal so the two can't drift. (Previously the inline copy passed
          // rightAxisFromLeftMax={tokensToCost}, which inflated the right-axis
          // max to a blended null-model cost far above the actual per-bucket
          // estCost, squashing the dashed cost line flat onto the x-axis so it
          // appeared to vanish inline while rendering fine when expanded.)
          chart(220)
        )}

        {forecastEnabled && forecast.error && (
          <Text style={{ fontSize: 11.5, color: "var(--red)" }}>
            Forecast unavailable: {forecast.error.message}
          </Text>
        )}
        <ChartModal
          open={expander.open}
          onClose={() => expander.setOpen(false)}
          title="Token consumption"
          subtitle={`Tokens (solid) · Est. cost (dashed, right axis) · per ${intervalPhrase}${forecastEnabled ? " · Forecast (dashed)" : ""}`}
          stats={stats}
        >
          {chart(440)}
        </ChartModal>
      </Flex>
  );
};

export const TokenConsumptionChart = ({ showExample = false }: { showExample?: boolean }) => (
  <CollapsibleCard
    title="Token consumption"
    info="Token usage over the active timeframe, aggregated at a snapped time interval (1m / 5m / 15m / 30m / 1h / 6h / 1d). Solid line is total tokens per interval; the dashed line is estimated cost on the right axis, reconciled to the actual fleet spend (distributed across intervals by token share, since exact per-model cost per interval needs a per-model time query). The spend figure splits actual (priced models) from estimated (models not in the pricing table). Toggle Forecast to overlay Dynatrace Intelligence predictions. Click-and-drag to brush a narrower range; focus the chart and use arrow keys to read values."
    defaultOpen
  >
    <ScanScope name="Token consumption">
      <TokenConsumptionBody showExample={showExample} />
    </ScanScope>
  </CollapsibleCard>
);
