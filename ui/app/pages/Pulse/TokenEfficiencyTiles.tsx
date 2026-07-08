import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtCount, fmtPercent, fmtRate, fmtTokens, fmtUSD } from "../../data/format";
import { toneToColor } from "../../theme/statusColor";
import { StatTile } from "../../components/StatTile";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import {
  ChartModal,
  useChartExpander,
} from "../../components/charts/ChartExpander";
import { useTokenEfficiency } from "./useTokenEfficiency";
import { usePulseSeries } from "./archMap/usePulseSeries";
import { useSpendBreakdown } from "./useSpendBreakdown";
import { Spark } from "./archMap/Spark";

const ok = (s: number[]): number[] | undefined => (s.length > 1 ? s : undefined);

/** Sub-eyebrow caption that used to live in TileShell's `hint`. Rendered as
 *  the first child of StatTile so it sits directly under the label. */
const Hint = ({ children }: { children: React.ReactNode }) => (
  <Text style={{ fontSize: 10.5, color: "var(--text-4)" }}>{children}</Text>
);

const Big = ({
  value,
  suffix,
  color,
}: {
  value: string;
  suffix?: string;
  color?: string;
}) => (
  <Flex alignItems="baseline" gap={4}>
    <Text
      style={{
        fontFamily: "var(--mono, monospace)",
        fontSize: 30,
        fontWeight: 600,
        lineHeight: 1,
        color: color ?? "var(--text)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {value}
    </Text>
    {suffix && (
      <Text style={{ fontSize: 12, color: "var(--text-3)" }}>{suffix}</Text>
    )}
  </Flex>
);

const Driver = ({
  label,
  value,
  spark,
  sparkColor,
  sparkFormat,
  sparkLabels,
}: {
  label: string;
  value: string;
  spark?: number[];
  sparkColor?: string;
  sparkFormat?: (n: number) => string;
  sparkLabels?: string[];
}) => (
  <Flex alignItems="center" gap={12}>
    <Text style={{ fontSize: 11.5, color: "var(--text-3)", whiteSpace: "nowrap" }}>{label}</Text>
    <div style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "flex-end" }}>
      {spark && (
        <div style={{ flex: 1, minWidth: 80 }}>
          <Spark
            data={spark}
            color={sparkColor ?? "var(--blue)"}
            height={24}
            fluid
            format={sparkFormat}
            labels={sparkLabels}
          />
        </div>
      )}
    </div>
    <Text
      style={{
        fontSize: 11.5,
        color: "var(--text-2)",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      {value}
    </Text>
  </Flex>
);

// Severity color routed through the shared tone→--status-* token map so the
// score value stays in lockstep with the app-wide status ramp (CONS-4). Exact
// thresholds preserved: >=70 ideal, >=40 warning, else critical.
const scoreColor = (score: number): string =>
  toneToColor(score >= 70 ? "good" : score >= 40 ? "warn" : "bad");

/**
 * One driver series rendered large inside a ChartModal: a labelled header row
 * with the current value, and the same `Spark` stretched tall/fluid. Hover the
 * line to read per-bucket values (with bucket-time labels).
 */
const EnlargedSpark = ({
  label,
  value,
  data,
  color,
  format,
  labels,
}: {
  label: string;
  value: string;
  data?: number[];
  color: string;
  format?: (n: number) => string;
  labels?: string[];
}) => (
  <Flex flexDirection="column" gap={6}>
    <Flex alignItems="baseline" justifyContent="space-between" gap={12}>
      <Text style={{ fontSize: 12.5, color: "var(--text-2)" }}>{label}</Text>
      <Text
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </Text>
    </Flex>
    {data ? (
      <div style={{ height: 150 }}>
        <Spark
          data={data}
          color={color}
          height={150}
          fluid
          area
          format={format}
          labels={labels}
        />
      </div>
    ) : (
      <Text style={{ fontSize: 11.5, color: "var(--text-4)" }}>
        Not enough history to chart in the current scope.
      </Text>
    )}
  </Flex>
);

const TokenEfficiencyBody = () => {
  const eff = useTokenEfficiency();
  const series = usePulseSeries();
  const spend = useSpendBreakdown();
  const scoreExpander = useChartExpander();
  const opdExpander = useChartExpander();

  // Derived per-bucket driver series. Spend per bucket distributes the REAL
  // per-model total (useSpendBreakdown) by token share — no flat blended rate.
  const calls = series.throughput.llm ?? [];
  const sumTok = series.tokens.reduce((a, b) => a + b, 0);
  const secPerBucket = series.intervalMs / 1000;
  const inputPerReq = calls.map((c, i) => (c > 0 ? (series.inputTokens[i] ?? 0) / c : 0));
  const costPer1kOut = series.outputTokens.map((out, i) => {
    const spendBucket = sumTok > 0 ? spend.total * ((series.tokens[i] ?? 0) / sumTok) : 0;
    return out > 0 ? spendBucket / (out / 1000) : 0;
  });
  const tokPerSec = series.outputTokens.map((out) => (secPerBucket > 0 ? out / secPerBucket : 0));

  return (
    <>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
        gap: "var(--d-gap)",
      }}
    >
      <StatTile
        label="Token efficiency score"
        headerRight={scoreExpander.expandButton("Expand token efficiency score")}
        info={
          "0–100 composite of how effectively tokens are turned into output. " +
          "Weighted: output leverage 50% (output ÷ total tokens), completion 30% " +
          "(1 − truncation rate, where a response cut off by max_tokens counts as " +
          "waste), and throughput 20% (output tokens/sec vs a 60 tok/s target). " +
          "It measures cost/throughput/waste, not output quality. Higher is " +
          "better; a low score is usually driven by input/context bloat (see " +
          "'Input tokens / request')." +
          (eff.hasEval
            ? ""
            : " Note: no evaluation scores are present in the current data, so " +
              "output quality can't be factored in.")
        }
      >
        <Hint>Cost / throughput / waste — not quality-adjusted</Hint>
        {eff.isLoading ? (
          <Skeleton style={{ height: 30, width: 90 }} />
        ) : eff.score == null ? (
          <Big value="—" />
        ) : (
          <>
            <Big
              value={String(eff.score)}
              suffix="/ 100"
              color={scoreColor(eff.score)}
            />
            <Flex flexDirection="column" gap={4} style={{ marginTop: 4 }}>
              <Driver
                label="Output share (leverage)"
                value={fmtPercent(eff.leverage * 100, 1)}
              />
              <Driver
                label="Input tokens / request"
                value={fmtTokens(eff.inputTokensPerRequest)}
                spark={ok(inputPerReq)}
                sparkColor="var(--blue)"
                sparkFormat={fmtCount}
                sparkLabels={series.labels}
              />
              <Driver
                label="Truncation (waste)"
                value={fmtPercent(eff.truncationRatePct, 1)}
                spark={ok(series.truncation)}
                sparkColor="var(--amber)"
                sparkFormat={fmtCount}
                sparkLabels={series.labels}
              />
            </Flex>
          </>
        )}
      </StatTile>

      <StatTile
        label="Output per dollar"
        headerRight={opdExpander.expandButton("Expand output per dollar")}
        info={
          "Output tokens produced per US dollar of model spend (total output " +
          "tokens ÷ total cost). A plain, benchmark-free efficiency metric — " +
          "higher is better. It naturally penalizes large input/context per " +
          "request, since input tokens add cost without adding output. Cost is " +
          "computed per model from the rates in Model Rates; see 'Cost / 1K " +
          "output tokens' and 'Throughput' below for the drivers."
        }
      >
        <Hint>Output tokens generated per $ spent</Hint>
        {eff.isLoading ? (
          <Skeleton style={{ height: 30, width: 90 }} />
        ) : eff.outputPerDollar == null ? (
          <Big value="—" />
        ) : (
          <>
            <Big value={fmtTokens(eff.outputPerDollar)} suffix="tok / $" />
            <Flex flexDirection="column" gap={4} style={{ marginTop: 4 }}>
              <Driver
                label="Cost / 1K output tokens"
                value={
                  eff.costPer1kOutput == null
                    ? "—"
                    : fmtUSD(eff.costPer1kOutput)
                }
                spark={ok(costPer1kOut)}
                sparkColor="var(--green-2)"
                sparkFormat={(n) => fmtUSD(n)}
                sparkLabels={series.labels}
              />
              <Driver
                label="Throughput"
                value={fmtRate(eff.tokensPerSec, "tok/s")}
                spark={ok(tokPerSec)}
                sparkColor="var(--purple)"
                sparkFormat={(n) => fmtRate(n, "tok/s")}
                sparkLabels={series.labels}
              />
            </Flex>
          </>
        )}
      </StatTile>
    </div>

    <ChartModal
      open={scoreExpander.open}
      onClose={() => scoreExpander.setOpen(false)}
      title="Token efficiency score"
      subtitle="0–100 composite of how effectively tokens become output (cost / throughput / waste), with its per-bucket drivers over the active timeframe."
      stats={[
        {
          label: "Score",
          value: eff.score == null ? "—" : `${eff.score} / 100`,
        },
        {
          label: "Output share (leverage)",
          value: fmtPercent(eff.leverage * 100, 1),
        },
        {
          label: "Input tokens / request",
          value: fmtTokens(eff.inputTokensPerRequest),
        },
        {
          label: "Truncation (waste)",
          value: fmtPercent(eff.truncationRatePct, 1),
        },
      ]}
    >
      <Flex flexDirection="column" gap={24}>
        <EnlargedSpark
          label="Input tokens / request"
          value={fmtTokens(eff.inputTokensPerRequest)}
          data={ok(inputPerReq)}
          color="var(--blue)"
          format={fmtCount}
          labels={series.labels}
        />
        <EnlargedSpark
          label="Truncation (waste)"
          value={fmtPercent(eff.truncationRatePct, 1)}
          data={ok(series.truncation)}
          color="var(--amber)"
          format={fmtCount}
          labels={series.labels}
        />
      </Flex>
    </ChartModal>

    <ChartModal
      open={opdExpander.open}
      onClose={() => opdExpander.setOpen(false)}
      title="Output per dollar"
      subtitle="Output tokens produced per US dollar of model spend, with its cost and throughput drivers over the active timeframe."
      stats={[
        {
          label: "Output per dollar",
          value:
            eff.outputPerDollar == null
              ? "—"
              : `${fmtTokens(eff.outputPerDollar)} tok / $`,
        },
        {
          label: "Cost / 1K output tokens",
          value: eff.costPer1kOutput == null ? "—" : fmtUSD(eff.costPer1kOutput),
        },
        {
          label: "Throughput",
          value: fmtRate(eff.tokensPerSec, "tok/s"),
        },
      ]}
    >
      <Flex flexDirection="column" gap={24}>
        <EnlargedSpark
          label="Cost / 1K output tokens"
          value={
            eff.costPer1kOutput == null ? "—" : fmtUSD(eff.costPer1kOutput)
          }
          data={ok(costPer1kOut)}
          color="var(--green-2)"
          format={(n) => fmtUSD(n)}
          labels={series.labels}
        />
        <EnlargedSpark
          label="Throughput"
          value={fmtRate(eff.tokensPerSec, "tok/s")}
          data={ok(tokPerSec)}
          color="var(--purple)"
          format={(n) => fmtRate(n, "tok/s")}
          labels={series.labels}
        />
      </Flex>
    </ChartModal>
    </>
  );
};

export const TokenEfficiencyTiles = () => (
  <CollapsibleCard title="Token efficiency" defaultOpen bodyPadding={16}>
    <TokenEfficiencyBody />
  </CollapsibleCard>
);
