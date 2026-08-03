import React, { useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { ChevronDownIcon, ChevronRightIcon } from "@dynatrace/strato-icons";
import { AreaChart } from "../../components/charts/AreaChart";
import {
  ChartModal,
  useChartExpander,
} from "../../components/charts/ChartExpander";
import { ForecastToggle } from "../../components/charts/ForecastToggle";
import { EmptyState, emptyCause } from "../../components/EmptyState";
import { InfoTooltip } from "../../components/InfoTooltip";
import { fmtCount } from "../../data/format";
import { useScope } from "../../scope/ScopeContext";
import {
  SCAN_LIMITS_GB,
  SCAN_LIMIT_LABELS,
  useScanLimit,
} from "../../scope/ScanLimitContext";
import { TIME_PRESETS } from "../../scope/types";
import { useInvocationsChart } from "./useInvocationsChart";

const INFO =
  "Total agent invocations over the active timeframe (distinct traces / runs carrying gen_ai.agent.name), at a snapped time interval. Toggle Forecast to overlay a Dynatrace Intelligence prediction of the next ~30% of the window. Click-and-drag across the chart to brush a narrower timeframe. Expand for per-interval statistics.";

/**
 * Agent-invocations time series with brush-to-zoom, a Dynatrace Intelligence
 * forecast overlay, x-axis time ticks, and a full-screen expand — the Agents
 * analogue of Pulse's token-consumption chart.
 */
export const InvocationsChart = ({
  showExample = false,
}: {
  /** Demo Mode / no-telemetry fallback — see BedrockPage's doc comment. */
  showExample?: boolean;
}) => {
  const { scope, setTimeframe } = useScope();
  const { scanLimitGb, setScanLimit } = useScanLimit();
  const [forecastEnabled, setForecastEnabled] = useState(false);
  const [open, setOpen] = useState(true);
  const model = useInvocationsChart(forecastEnabled, showExample);
  const expander = useChartExpander();

  // Why the panel is empty — a real error / truncated-scan / no-activity cause
  // instead of a hardcoded "no activity" (STATE-2, STATE-4).
  const emptyKind = emptyCause({ error: model.error, limitHit: model.limitHit });

  // Empty-state remedies wired to the real scope / scan-limit setters (STATE-6):
  // step the timeframe one preset wider, and raise the scan-limit one notch.
  const tfOrder = TIME_PRESETS.map((p) => p.value);
  const tfIdx = tfOrder.indexOf(scope.timeframe.from);
  const nextTf =
    tfIdx === -1
      ? "now()-24h"
      : tfIdx < tfOrder.length - 1
        ? tfOrder[tfIdx + 1]
        : null;
  const widenTimeframe = nextTf
    ? () => setTimeframe({ from: nextTf })
    : undefined;
  const scanIdx = SCAN_LIMITS_GB.indexOf(scanLimitGb);
  const nextScan =
    scanIdx >= 0 && scanIdx < SCAN_LIMITS_GB.length - 1
      ? SCAN_LIMITS_GB[scanIdx + 1]
      : null;
  const raiseScanLimit =
    nextScan != null ? () => setScanLimit(nextScan) : undefined;
  const raiseScanLabel =
    nextScan != null
      ? `Raise scan limit to ${SCAN_LIMIT_LABELS[nextScan]}`
      : "Scan limit at max";

  const chart = (height: number) => (
    <AreaChart
      height={height}
      formatLeft={(n) => fmtCount(Math.round(n))}
      xLabels={model.xLabels}
      axisTicks={model.axisTicks}
      forecasts={model.forecastBands}
      xDomain={model.xDomain}
      onBrushSelect={(range) => setTimeframe(range)}
      series={[
        {
          label: "Invocations",
          color: "var(--blue)",
          values: model.values,
          axis: "left",
        },
      ]}
    />
  );

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={8}>
        <Flex alignItems="baseline" justifyContent="space-between" gap={12}>
          <Flex flexDirection="column" gap={2}>
            <Flex alignItems="center" gap={6}>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-label={open ? "Collapse Invocations" : "Expand Invocations"}
                style={{ all: "unset", cursor: "pointer", display: "inline-flex" }}
              >
                {open ? (
                  <ChevronDownIcon size={16} style={{ color: "var(--text-3)" }} />
                ) : (
                  <ChevronRightIcon size={16} style={{ color: "var(--text-3)" }} />
                )}
              </button>
              <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
                Invocations
              </Heading>
              <InfoTooltip text={INFO} />
            </Flex>
            <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              Total agent invocations over the scope timeframe · per{" "}
              {model.intervalPhrase}
              {forecastEnabled ? " · Forecast (dashed)" : ""}
            </Text>
          </Flex>
          <Flex alignItems="center" gap={8}>
            <Text style={{ fontSize: 11.5, color: "var(--text-2)" }}>
              <strong>{fmtCount(model.total)}</strong> total
            </Text>
            <ForecastToggle
              enabled={forecastEnabled}
              loading={model.forecastLoading}
              error={model.forecastError}
              onChange={setForecastEnabled}
            />
            {expander.expandButton("Expand invocations chart")}
          </Flex>
        </Flex>

        {open &&
          (model.isLoading ? (
            <Skeleton style={{ height: 200 }} />
          ) : model.isEmpty ? (
            <EmptyState
              bare
              cause={emptyKind}
              title={
                emptyKind === "no-activity"
                  ? "No agent invocations in the current scope."
                  : undefined
              }
              hint="gen_ai.agent.name"
              actions={
                emptyKind === "error"
                  ? undefined
                  : [
                      { label: "Widen timeframe", onClick: widenTimeframe },
                      { label: raiseScanLabel, onClick: raiseScanLimit },
                    ]
              }
            />
          ) : (
            chart(200)
          ))}

        {open && forecastEnabled && model.forecastError && (
          <Text style={{ fontSize: 11.5, color: "var(--red)" }}>
            Forecast unavailable: {model.forecastError.message}
          </Text>
        )}
      </Flex>

      <ChartModal
        open={expander.open}
        onClose={() => expander.setOpen(false)}
        title="Invocations"
        subtitle={`Total agent invocations over the scope timeframe · per ${model.intervalPhrase}${forecastEnabled ? " · Forecast (dashed)" : ""}`}
        stats={model.stats}
      >
        {chart(440)}
      </ChartModal>
    </Surface>
  );
};
