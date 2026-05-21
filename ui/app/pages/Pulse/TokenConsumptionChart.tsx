import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
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
import { InfoTooltip } from "../../components/InfoTooltip";
import { fmtTokens, fmtUSDCompact } from "../../data/format";
import { useScope } from "../../scope/ScopeContext";
import { estimateCost, getPricing } from "../../data/pricing";
import type { UseTokenConsumptionResult } from "./useTokenConsumption";
import type { UseTokenForecastResult } from "./useTokenForecast";

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

export interface TokenConsumptionChartProps {
  result: UseTokenConsumptionResult;
  forecast: UseTokenForecastResult;
  forecastEnabled: boolean;
  onToggleForecast: (next: boolean) => void;
}

export const TokenConsumptionChart = ({
  result,
  forecast,
  forecastEnabled,
  onToggleForecast,
}: TokenConsumptionChartProps) => {
  const { setTimeframe } = useScope();
  const historicalTokens = result.points.map((p) => p.tokens);
  const historicalCosts = result.points.map((p) => p.estCost);
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

  // Per-bucket cost is derived from per-bucket tokens via the same blended
  // pricing as the historical Est. cost line, so the forecasted cost band
  // tracks the forecasted token band 1:1.
  const blended = useMemo(() => getPricing("claude-sonnet-4-6"), []);
  const tokensToCost = (n: number) =>
    estimateCost(n / 2, n / 2, blended);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecastEnabled, fc, histLen]);

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
      { label: "Per-bucket min", value: fmtTokens(min) },
      { label: "Per-bucket median", value: fmtTokens(median) },
      { label: "Per-bucket avg", value: fmtTokens(avg) },
      { label: "Per-bucket max", value: fmtTokens(max) },
    ];
  }, [historicalTokens, result.totalTokens, result.totalCost]);

  const chart = (chartHeight: number) => (
    <AreaChart
      height={chartHeight}
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
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="baseline" justifyContent="space-between">
          <Flex flexDirection="column" gap={2}>
            <Flex alignItems="center" gap={6}>
              <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
                Token consumption
              </Heading>
              <InfoTooltip text="Token usage over the active timeframe, bucketed at a snapped interval (1m / 5m / 15m / 30m / 1h / 6h / 1d). Solid line is total tokens per bucket; dashed line is blended estimated cost on the right axis. Toggle Forecast to overlay Dynatrace Intelligence predictions. Click-and-drag to brush a narrower range." />
            </Flex>
            <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              Tokens (solid) · Est. cost (dashed, right axis) · {result.intervalLabel} buckets
              {forecastEnabled ? " · Forecast (dashed purple)" : ""}
            </Text>
          </Flex>
          <Flex alignItems="center" gap={12}>
            <Text style={{ fontSize: 11.5, color: "var(--text-2)" }}>
              <strong>{fmtTokens(result.totalTokens)}</strong> tokens
            </Text>
            <Text style={{ fontSize: 11.5, color: "var(--text-2)" }}>
              <strong>{fmtUSDCompact(result.totalCost)}</strong> blended est.
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
          <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            No data in the current scope.
          </Text>
        ) : (
          <AreaChart
            height={220}
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
        )}

        {forecastEnabled && forecast.error && (
          <Text style={{ fontSize: 11.5, color: "var(--red)" }}>
            Forecast unavailable: {forecast.error.message}
          </Text>
        )}
      </Flex>
      <ChartModal
        open={expander.open}
        onClose={() => expander.setOpen(false)}
        title="Token consumption"
        subtitle={`Tokens (solid) · Est. cost (dashed, right axis) · ${result.intervalLabel} buckets${forecastEnabled ? " · Forecast (dashed)" : ""}`}
        stats={stats}
      >
        {chart(440)}
      </ChartModal>
    </Surface>
  );
};

interface ForecastToggleProps {
  enabled: boolean;
  loading: boolean;
  error: Error | undefined;
  onChange: (next: boolean) => void;
}

const ForecastToggle = ({
  enabled,
  loading,
  error,
  onChange,
}: ForecastToggleProps) => {
  const label = enabled ? (loading ? "Forecasting…" : "Forecast on") : "Forecast";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Toggle Dynatrace Intelligence forecast overlay"
      onClick={() => onChange(!enabled)}
      title={
        error
          ? `Forecast error: ${error.message}`
          : "Predict the next ~30% of the timeframe using Dynatrace Intelligence (GenericForecastAnalyzer). Forecast always reads unsampled data."
      }
      style={{
        all: "unset",
        cursor: "pointer",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: enabled ? 600 : 500,
        color: enabled ? "var(--purple-2)" : "var(--text-2)",
        background: enabled ? "var(--intel-soft)" : "var(--surface-2)",
        border: `1px solid ${enabled ? "var(--purple-2)" : "var(--border)"}`,
        fontVariantNumeric: "tabular-nums",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: enabled ? "var(--purple-2)" : "var(--text-3)",
          opacity: loading ? 0.6 : 1,
        }}
      />
      {label}
    </button>
  );
};
