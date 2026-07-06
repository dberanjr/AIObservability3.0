/**
 * Compact spend glance (redesign C.4, absorbed from FinOps): 24h, 7d, and
 * projected 30d effective cost. All figures flow through the section-G cost
 * model (useFinOps computes them via costOf). Full cost analysis lives in the
 * Models / FinOps tab.
 */
import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { SamplingBadge } from "../../components/SamplingBadge";
import { useSampling } from "../../scope/SamplingContext";
import { useDailySpend } from "./useDailySpend";
import { fmtUSD, fmtUSDCompact } from "../../data/format";

/** Daily spend bars (one bar per day) with a value label above each. */
const DailyBars = ({
  data,
  labels,
  color,
}: {
  data: number[];
  labels: string[];
  color: string;
}) => {
  const max = Math.max(...data, 1);
  return (
    <Flex alignItems="stretch" gap={6} style={{ height: 66, width: "100%" }}>
      {data.map((v, i) => (
        <Flex
          key={i}
          flexDirection="column"
          alignItems="center"
          gap={2}
          style={{ flex: 1, minWidth: 0, height: "100%" }}
          title={`${fmtUSD(v)}${labels[i] ? ` · ${labels[i]}` : ""}`}
        >
          <Text
            style={{
              fontSize: 9.5,
              fontWeight: 600,
              color: "var(--text-2)",
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}
          >
            {fmtUSDCompact(v)}
          </Text>
          <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
            <div
              style={{
                width: "100%",
                height: `${Math.max(2, (v / max) * 100)}%`,
                background: color,
                opacity: 0.85,
                borderRadius: "3px 3px 0 0",
              }}
            />
          </div>
        </Flex>
      ))}
    </Flex>
  );
};

/** ▲/▼ delta chip for the headline numbers. */
const Delta = ({ pct }: { pct: number | null }) => {
  if (pct == null || !Number.isFinite(pct)) return null;
  const up = pct >= 0;
  return (
    <Text style={{ fontSize: 11, fontWeight: 600, color: up ? "var(--red)" : "var(--green-2)" }}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
    </Text>
  );
};

const Cell = ({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number | null;
}) => (
  <Flex flexDirection="column" gap={2} style={{ flex: 1 }}>
    <Flex alignItems="baseline" gap={6}>
      <Text style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Text>
      {delta !== undefined && <Delta pct={delta} />}
    </Flex>
    <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{label}</Text>
  </Flex>
);

const SpendGlanceBody = () => {
  const { spend24h, spend7d, projected30d, delta24h, bars, barLabels, samplingRatio } =
    useDailySpend();
  const { samplingRatio: toolbarRatio } = useSampling();
  // scan-6: these per-day scans force their own sampling floor, so when it's
  // coarser than the toolbar the numbers are a rougher estimate than the global
  // control implies — disclose the actual ratio used on this tile.
  const overrideRatio = samplingRatio > toolbarRatio ? samplingRatio : undefined;

  return (
      <Flex flexDirection="column" gap={12} style={{ padding: "14px 18px" }}>
        {overrideRatio != null && (
          <SamplingBadge variant="full" ratio={overrideRatio} />
        )}
        <Flex gap={20}>
          <Cell label="Last 24h" value={fmtUSD(spend24h)} delta={delta24h} />
          <Cell label="Last 7d" value={fmtUSD(spend7d)} />
          <Cell label="Projected 30d" value={fmtUSD(projected30d)} />
        </Flex>
        {bars.length > 1 && (
          <Flex flexDirection="column" gap={4}>
            <Text
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "var(--text-3)",
              }}
            >
              Daily spend · last {bars.length} days
            </Text>
            <DailyBars data={bars} labels={barLabels} color="var(--green-2)" />
          </Flex>
        )}
      </Flex>
  );
};

export const SpendGlance = () => (
  <CollapsibleCard title="Spend glance" defaultOpen>
    <SpendGlanceBody />
  </CollapsibleCard>
);
