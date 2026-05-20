import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { AreaChart, type ForecastBand } from "../../components/charts/AreaChart";
import { fmtTokens, fmtUSDCompact } from "../../data/format";
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
  const historicalTokens = result.points.map((p) => p.tokens);
  const historicalCosts = result.points.map((p) => p.estCost);
  const histLen = historicalTokens.length;
  const fc = forecast.forecast;
  const forecastLen = forecastEnabled && fc ? fc.values.length : 0;

  // Append zero-tails so the historical series and the forecast share the
  // same x-axis length. Forecast band itself is null-padded so it only
  // appears to the right of the divider.
  const tokensCombined = useMemo(
    () => historicalTokens.concat(new Array(forecastLen).fill(0)),
    [historicalTokens, forecastLen],
  );
  const costsCombined = useMemo(
    () => historicalCosts.concat(new Array(forecastLen).fill(0)),
    [historicalCosts, forecastLen],
  );

  const xLabels = useMemo(
    () => buildLabels(histLen, result.intervalMs, forecastLen),
    [histLen, result.intervalMs, forecastLen],
  );

  const forecastBand: ForecastBand | undefined = useMemo(() => {
    if (!forecastEnabled || !fc || histLen === 0) return undefined;
    const leadingNulls = new Array<number | null>(histLen).fill(null);
    return {
      values: leadingNulls.concat(fc.values),
      lower: leadingNulls.concat(fc.lower),
      upper: leadingNulls.concat(fc.upper),
      startIdx: histLen,
      color: "var(--purple-2)",
      label: "Forecast",
      axis: "left",
    };
  }, [forecastEnabled, fc, histLen]);

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="baseline" justifyContent="space-between">
          <Flex flexDirection="column" gap={2}>
            <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
              Token consumption
            </Heading>
            <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              Tokens (solid) · Est. cost (dashed, right axis)
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
            forecast={forecastBand}
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
