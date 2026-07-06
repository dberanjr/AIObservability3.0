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
import { InfoTooltip } from "../../components/InfoTooltip";
import { fmtCount } from "../../data/format";
import { useScope } from "../../scope/ScopeContext";
import { useInvocationsChart } from "./useInvocationsChart";

const INFO =
  "Total agent invocations over the active timeframe (distinct traces / runs carrying gen_ai.agent.name), at a snapped time interval. Toggle Forecast to overlay a Dynatrace Intelligence prediction of the next ~30% of the window. Click-and-drag across the chart to brush a narrower timeframe. Expand for per-interval statistics.";

/**
 * Agent-invocations time series with brush-to-zoom, a Dynatrace Intelligence
 * forecast overlay, x-axis time ticks, and a full-screen expand — the Agents
 * analogue of Pulse's token-consumption chart.
 */
export const InvocationsChart = () => {
  const { setTimeframe } = useScope();
  const [forecastEnabled, setForecastEnabled] = useState(false);
  const [open, setOpen] = useState(true);
  const model = useInvocationsChart(forecastEnabled);
  const expander = useChartExpander();

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
            <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
              No agent invocations in the current scope.
            </Text>
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
