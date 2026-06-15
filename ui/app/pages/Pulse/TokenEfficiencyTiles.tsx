import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtCount, fmtPercent, fmtTokens, fmtUSD } from "../../data/format";
import { InfoTooltip } from "../../components/InfoTooltip";
import { useTokenEfficiency } from "./useTokenEfficiency";
import { usePulseSeries } from "./archMap/usePulseSeries";
import { useSpendBreakdown } from "./useSpendBreakdown";
import { Spark } from "./archMap/Spark";

const ok = (s: number[]): number[] | undefined => (s.length > 1 ? s : undefined);

const TileShell = ({
  label,
  hint,
  info,
  children,
}: {
  label: string;
  hint?: string;
  info?: string;
  children: React.ReactNode;
}) => (
  <Surface elevation="raised" padding={16}>
    <Flex flexDirection="column" gap={8} style={{ minWidth: 0 }}>
      <Flex flexDirection="column" gap={2}>
        <Flex alignItems="center" gap={6}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-3)",
            }}
          >
            {label}
          </Text>
          {info && <InfoTooltip text={info} />}
        </Flex>
        {hint && (
          <Text style={{ fontSize: 10.5, color: "var(--text-4)" }}>{hint}</Text>
        )}
      </Flex>
      {children}
    </Flex>
  </Surface>
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

const scoreColor = (score: number): string =>
  score >= 70 ? "var(--green-2)" : score >= 40 ? "var(--amber)" : "var(--red)";

export const TokenEfficiencyTiles = () => {
  const eff = useTokenEfficiency();
  const series = usePulseSeries();
  const spend = useSpendBreakdown();

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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
        gap: 16,
      }}
    >
      <TileShell
        label="Token efficiency score"
        hint="Cost / throughput / waste — not quality-adjusted"
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
                sparkFormat={fmtTokens}
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
      </TileShell>

      <TileShell
        label="Output per dollar"
        hint="Output tokens generated per $ spent"
        info={
          "Output tokens produced per US dollar of model spend (total output " +
          "tokens ÷ total cost). A plain, benchmark-free efficiency metric — " +
          "higher is better. It naturally penalizes large input/context per " +
          "request, since input tokens add cost without adding output. Cost is " +
          "computed per model from the rates in Model Rates; see 'Cost / 1K " +
          "output tokens' and 'Throughput' below for the drivers."
        }
      >
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
                value={`${Math.round(eff.tokensPerSec).toLocaleString()} tok/s`}
                spark={ok(tokPerSec)}
                sparkColor="var(--purple)"
                sparkFormat={(n) => `${Math.round(n).toLocaleString()} tok/s`}
                sparkLabels={series.labels}
              />
            </Flex>
          </>
        )}
      </TileShell>
    </div>
  );
};
