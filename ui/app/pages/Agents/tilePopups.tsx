import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Button } from "@dynatrace/strato-components/buttons";
import { FilterIcon } from "@dynatrace/strato-icons";
import { AreaChart } from "../../components/charts/AreaChart";
import { ForecastToggle } from "../../components/charts/ForecastToggle";
import { DataGapNote } from "../../components/DataGapNote";
import { FilterTrigger } from "../../components/FilterTrigger";
import {
  ExampleDataFrame,
  MissingDataHint,
} from "../../components/displayHints";
import {
  fmtCount,
  fmtMs,
  fmtPercent,
  fmtUSD,
  fmtUSDCompact,
} from "../../data/format";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import { useTweaks } from "../../tweaks/TweaksContext";
import type { AgentRow } from "./useAgents";
import { summarizeAgentTtft, TTFT_ATTRIBUTES } from "./ttft";
import { useInvocationsChart } from "./useInvocationsChart";
import { useAgentLoops, LOOP_REPEAT_RATIO, LOOP_MAX_STEP } from "./useAgentLoops";
import { useAgentLoopSeries } from "./useAgentLoopSeries";

const SLOW_P90_MS = 2000;

/* ----------------------------- shared bits ----------------------------- */

export interface Stat {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}

export const StatStrip = ({ stats }: { stats: Stat[] }) => {
  if (stats.length === 0) return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(stats.length, 6)}, minmax(0, 1fr))`,
        gap: 12,
        borderBottom: "1px solid var(--border)",
        paddingBottom: 16,
      }}
    >
      {stats.map((s) => (
        <Flex key={s.label} flexDirection="column" gap={2}>
          <Text
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-3)",
            }}
          >
            {s.label}
          </Text>
          <Text
            style={{
              fontSize: 20,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              color: s.color ?? "var(--text)",
              lineHeight: 1.1,
            }}
          >
            {s.value}
          </Text>
          {s.sub && (
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{s.sub}</Text>
          )}
        </Flex>
      ))}
    </div>
  );
};

interface Column<T> {
  key: string;
  header: string;
  width?: number;
  align?: "left" | "right";
  render: (row: T) => React.ReactNode;
}

function PopupTable<T>({
  rows,
  columns,
  empty,
  maxHeight = 420,
}: {
  rows: T[];
  columns: Column<T>[];
  empty: string;
  maxHeight?: number;
}) {
  if (rows.length === 0) {
    return (
      <Text style={{ fontSize: 12.5, color: "var(--text-3)", padding: "12px 0" }}>
        {empty}
      </Text>
    );
  }
  return (
    <div style={{ maxHeight, overflowY: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12.5,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  position: "sticky",
                  top: 0,
                  background: "var(--surface)",
                  padding: "6px 8px",
                  textAlign: c.align ?? "left",
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                  width: c.width,
                  whiteSpace: "nowrap",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  style={{
                    padding: "7px 8px",
                    textAlign: c.align ?? "left",
                    width: c.width,
                    maxWidth: c.width ?? 280,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const AgentCell = ({ agent }: { agent: string }) => (
  <span style={{ fontFamily: "var(--mono, monospace)" }}>
    <FilterTrigger attribute="gen_ai.agent.name" value={agent} label="agent">
      {agent}
    </FilterTrigger>
  </span>
);

/* --------------------------- Total agents ------------------------------ */

export const TotalAgentsBody = ({ agents }: { agents: AgentRow[] }) => {
  const substantive = agents.filter((a) => !a.isOrchestration);
  const orchestration = agents.length - substantive.length;
  const services = new Set(substantive.map((a) => a.service).filter(Boolean));
  const frameworks = new Set(
    substantive.map((a) => a.framework).filter((f): f is string => !!f),
  );
  const rows = [...substantive].sort((a, b) => b.invocations - a.invocations);

  return (
    <Flex flexDirection="column" gap={16}>
      <StatStrip
        stats={[
          { label: "Agents", value: fmtCount(substantive.length) },
          { label: "Orchestration nodes", value: fmtCount(orchestration) },
          { label: "Distinct services", value: fmtCount(services.size) },
          {
            label: "Frameworks",
            value: frameworks.size > 0 ? [...frameworks].join(", ") : "—",
          },
        ]}
      />
      <PopupTable
        rows={rows}
        empty="No agents in the current scope."
        columns={[
          { key: "agent", header: "Agent", render: (r) => <AgentCell agent={r.agent} /> },
          {
            key: "service",
            header: "Service",
            width: 200,
            render: (r) => (
              <span style={{ fontFamily: "var(--mono, monospace)", color: "var(--text-2)" }}>
                {r.service || "—"}
              </span>
            ),
          },
          { key: "inv", header: "Inv", width: 90, align: "right", render: (r) => fmtCount(r.invocations) },
          { key: "p90", header: "P90", width: 90, align: "right", render: (r) => fmtMs(r.p90Ms) },
          {
            key: "cost",
            header: "$/inv",
            width: 90,
            align: "right",
            render: (r) => (r.costAttributed ? fmtUSD(r.costPerInvocation) : "—"),
          },
        ]}
      />
    </Flex>
  );
};

/* ---------------------------- Invocations ------------------------------ */

export const InvocationsBody = () => {
  const { setTimeframe } = useScope();
  const [forecastEnabled, setForecastEnabled] = useState(false);
  const model = useInvocationsChart(forecastEnabled);

  return (
    <Flex flexDirection="column" gap={16}>
      <StatStrip stats={model.stats} />
      <Flex justifyContent="flex-end">
        <ForecastToggle
          enabled={forecastEnabled}
          loading={model.forecastLoading}
          error={model.forecastError}
          onChange={setForecastEnabled}
        />
      </Flex>
      {model.isLoading ? (
        <Skeleton style={{ height: 360 }} />
      ) : model.isEmpty ? (
        <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
          No agent invocations in the current scope.
        </Text>
      ) : (
        <AreaChart
          height={360}
          formatLeft={(n) => fmtCount(Math.round(n))}
          xLabels={model.xLabels}
          axisTicks={model.axisTicks}
          forecasts={model.forecastBands}
          xDomain={model.xDomain}
          onBrushSelect={(range) => setTimeframe(range)}
          series={[
            {
              label: "Invocations",
              color: "var(--purple)",
              values: model.values,
              axis: "left",
            },
          ]}
        />
      )}
      <Text style={{ fontSize: 11, color: "var(--text-4)" }}>
        Click-and-drag across the chart to brush a narrower timeframe. Toggle
        Forecast to overlay a Dynatrace Intelligence prediction.
      </Text>
    </Flex>
  );
};

/* ---------------------------- Slow agents ------------------------------ */

export const SlowAgentsBody = ({ agents }: { agents: AgentRow[] }) => {
  const slow = agents
    .filter((a) => !a.isOrchestration && a.p90Ms > SLOW_P90_MS)
    .sort((a, b) => b.p90Ms - a.p90Ms);
  const slowest = slow[0];

  return (
    <Flex flexDirection="column" gap={16}>
      <StatStrip
        stats={[
          { label: "Slow agents", value: fmtCount(slow.length), color: slow.length > 0 ? "var(--amber)" : undefined },
          { label: "Threshold", value: `P90 > ${SLOW_P90_MS / 1000}s` },
          { label: "Slowest", value: slowest ? fmtMs(slowest.p90Ms) : "—", sub: slowest?.agent },
        ]}
      />
      <PopupTable
        rows={slow}
        empty="No agents above the slow threshold in the current scope."
        columns={[
          { key: "agent", header: "Agent", render: (r) => <AgentCell agent={r.agent} /> },
          {
            key: "service",
            header: "Service",
            width: 180,
            render: (r) => (
              <span style={{ fontFamily: "var(--mono, monospace)", color: "var(--text-2)" }}>{r.service || "—"}</span>
            ),
          },
          { key: "inv", header: "Inv", width: 80, align: "right", render: (r) => fmtCount(r.invocations) },
          {
            key: "p90",
            header: "P90",
            width: 90,
            align: "right",
            render: (r) => <span style={{ color: "var(--amber)" }}>{fmtMs(r.p90Ms)}</span>,
          },
          { key: "p99", header: "P99", width: 90, align: "right", render: (r) => fmtMs(r.p99Ms) },
          {
            key: "err",
            header: "Err",
            width: 70,
            align: "right",
            render: (r) => (r.errors > 0 ? fmtPercent(r.errorRatePct) : "0%"),
          },
        ]}
      />
    </Flex>
  );
};

/* ----------------------------- Error rate ------------------------------ */

export const ErrorRateBody = ({ agents }: { agents: AgentRow[] }) => {
  const subs = agents.filter((a) => !a.isOrchestration);
  const invocations = subs.reduce((acc, a) => acc + a.invocations, 0);
  const errors = subs.reduce((acc, a) => acc + a.errors, 0);
  const rate = invocations > 0 ? (errors / invocations) * 100 : 0;
  const withErrors = subs.filter((a) => a.errors > 0).sort((a, b) => b.errors - a.errors);
  const worst = [...subs].sort((a, b) => b.errorRatePct - a.errorRatePct)[0];

  return (
    <Flex flexDirection="column" gap={16}>
      <StatStrip
        stats={[
          {
            label: "Fleet error rate",
            value: fmtPercent(rate),
            color: rate > 5 ? "var(--red)" : rate > 1 ? "var(--amber)" : undefined,
          },
          { label: "Total errors", value: fmtCount(errors) },
          { label: "Invocations", value: fmtCount(invocations) },
          {
            label: "Worst agent",
            value: worst && worst.errors > 0 ? fmtPercent(worst.errorRatePct) : "—",
            sub: worst && worst.errors > 0 ? worst.agent : undefined,
          },
        ]}
      />
      <PopupTable
        rows={withErrors}
        empty="No errors recorded for any agent in the current scope."
        columns={[
          { key: "agent", header: "Agent", render: (r) => <AgentCell agent={r.agent} /> },
          { key: "inv", header: "Inv", width: 100, align: "right", render: (r) => fmtCount(r.invocations) },
          { key: "errors", header: "Errors", width: 100, align: "right", render: (r) => fmtCount(r.errors) },
          {
            key: "rate",
            header: "Error rate",
            width: 110,
            align: "right",
            render: (r) => (
              <span style={{ color: r.errorRatePct > 5 ? "var(--red)" : r.errorRatePct > 1 ? "var(--amber)" : undefined }}>
                {fmtPercent(r.errorRatePct)}
              </span>
            ),
          },
        ]}
      />
      <Text style={{ fontSize: 11, color: "var(--text-4)", lineHeight: 1.5 }}>
        Error rate includes transport/span errors and logical failures (refusals
        / content-filter blocks) where those attributes are emitted.
      </Text>
    </Flex>
  );
};

/* ------------------------------- Cost ---------------------------------- */

export const CostBody = ({ agents }: { agents: AgentRow[] }) => {
  const subs = agents.filter((a) => !a.isOrchestration);
  const totalCost = subs.reduce((acc, a) => acc + a.cost, 0);
  const attributed = subs.filter((a) => a.costAttributed);
  const unattributed = subs.length - attributed.length;
  const byCost = [...attributed].sort((a, b) => b.cost - a.cost);

  const byModel = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of attributed) {
      const model = a.models[0] ?? "unknown";
      m.set(model, (m.get(model) ?? 0) + a.cost);
    }
    return [...m.entries()].sort((x, y) => y[1] - x[1]);
  }, [attributed]);

  return (
    <Flex flexDirection="column" gap={16}>
      <StatStrip
        stats={[
          { label: "Attributed cost", value: fmtUSDCompact(totalCost), sub: "this scope" },
          { label: "Agents with cost", value: fmtCount(attributed.length) },
          { label: "Unattributed", value: fmtCount(unattributed), sub: "proxy-trace gap" },
          { label: "Models", value: fmtCount(byModel.length) },
        ]}
      />
      {byModel.length > 0 && (
        <Flex flexDirection="column" gap={6}>
          <Text style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)" }}>
            Cost by model
          </Text>
          <Flex gap={8} style={{ flexWrap: "wrap" }}>
            {byModel.map(([model, cost]) => (
              <Flex
                key={model}
                alignItems="baseline"
                gap={6}
                style={{ padding: "4px 10px", borderRadius: 6, background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                <Text style={{ fontSize: 12, fontFamily: "var(--mono, monospace)" }}>{model}</Text>
                <Text style={{ fontSize: 12, fontWeight: 600 }}>{fmtUSD(cost)}</Text>
              </Flex>
            ))}
          </Flex>
        </Flex>
      )}
      <PopupTable
        rows={byCost}
        empty="No agent cost is attributable in this scope — LLM calls run through the central proxy in a separate trace. Fleet cost is exact on the Models / FinOps tab."
        columns={[
          { key: "agent", header: "Agent", render: (r) => <AgentCell agent={r.agent} /> },
          { key: "in", header: "Input tok", width: 110, align: "right", render: (r) => fmtCount(r.inputTokens) },
          { key: "out", header: "Output tok", width: 110, align: "right", render: (r) => fmtCount(r.outputTokens) },
          { key: "perinv", header: "$/inv", width: 90, align: "right", render: (r) => fmtUSD(r.costPerInvocation) },
          { key: "total", header: "Total", width: 90, align: "right", render: (r) => fmtUSD(r.cost) },
        ]}
      />
    </Flex>
  );
};

/* ------------------------------- TTFT ---------------------------------- */

const EXAMPLE_TTFT = [420, 510, 640, 380, 720, 560, 480, 610, 530, 690];

export const TtftBody = ({
  agents,
  onApplied,
}: {
  agents: AgentRow[];
  /** Invoked after the filter is applied so the caller can close the modal. */
  onApplied?: () => void;
}) => {
  const { pageConfig } = useTweaks();
  const showExample = pageConfig.showExampleData;
  const { setPresenceCondition } = useGlobalFilters();
  const summary = summarizeAgentTtft(agents);

  // Real data: TTFT is emitted (streamed responses). Show the fleet
  // distribution built from per-agent averages, not the example placeholder.
  if (summary) {
    const agentCount = summary.agentsWithTtft;
    // Scope the whole app to the traces that actually contain a TTFT span. A
    // presence filter on the TTFT attribute is *selective* (Grail skips blocks
    // without the column), so the trace-scope resolver completes — unlike a
    // gen_ai.agent.name filter, which scans the whole spans bucket and gets
    // truncated by the scan limit before finding these sparse agents.
    const filterToTtftTraces = () => {
      setPresenceCondition("gen_ai.response.ttft", TTFT_ATTRIBUTES);
      onApplied?.();
    };
    return (
      <Flex flexDirection="column" gap={16}>
        <Text style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>
          Time-to-first-token measures responsiveness of streamed model
          responses — the delay before the first token reaches the user. Derived
          from <code>gen_ai.response.ttft</code> on streamed agent responses; the
          chart shows each emitting agent&apos;s average TTFT, ascending.
        </Text>
        <StatStrip
          stats={[
            { label: "Median TTFT", value: fmtMs(summary.medianMs) },
            { label: "P90 TTFT", value: fmtMs(summary.p90Ms) },
            { label: "Mean TTFT", value: fmtMs(summary.avgMs) },
            { label: "Agents emitting", value: fmtCount(agentCount) },
          ]}
        />
        <Flex flexDirection="row" alignItems="center" gap={12} flexWrap="wrap">
          <Button variant="accent" onClick={filterToTtftTraces}>
            <Button.Prefix>
              <FilterIcon />
            </Button.Prefix>
            Filter to TTFT-emitting traces
          </Button>
          <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
            Scopes every tab to the {agentCount === 1 ? "1 agent" : `${agentCount} agents`}
            &apos; traces that contain a TTFT span. Clear it anytime with Reset in
            the toolbar.
          </Text>
        </Flex>
        <AreaChart
          height={260}
          formatLeft={(n) => fmtMs(n)}
          series={[
            { label: "Avg TTFT by agent", color: "var(--purple)", values: summary.values },
          ]}
        />
      </Flex>
    );
  }

  const exampleChart = (
    <Flex flexDirection="column" gap={12}>
      <StatStrip
        stats={[
          { label: "P50 TTFT", value: "480 ms" },
          { label: "P90 TTFT", value: "690 ms" },
          { label: "P99 TTFT", value: "1.2 s" },
        ]}
      />
      <AreaChart
        height={260}
        formatLeft={(n) => fmtMs(n)}
        series={[{ label: "TTFT (example)", color: "var(--purple)", values: EXAMPLE_TTFT }]}
      />
    </Flex>
  );

  return (
    <Flex flexDirection="column" gap={16}>
      <Text style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>
        Time-to-first-token measures responsiveness of streamed model
        responses — the delay before the first token reaches the user. No agent
        in this scope emits it, so there is nothing to chart.
      </Text>
      {showExample ? (
        <ExampleDataFrame attribute="gen_ai.response.ttft">
          {exampleChart}
        </ExampleDataFrame>
      ) : (
        <MissingDataHint
          note="Enable 'Show example data' in Tweaks to preview what this panel would look like once TTFT is emitted"
          attribute="gen_ai.response.ttft"
        />
      )}
      <DataGapNote
        message="TTFT is not emitted on any LLM/agent span in this scope. It must be recorded on streamed responses (the elapsed time from request start to the first streamed token)."
        attributes={["gen_ai.response.ttft"]}
        bestPractice="Emit a time-to-first-token attribute on streamed responses. See INSTRUMENTATION-REQUIREMENTS.md P1.5."
        href="https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/"
        hrefLabel="OTel GenAI spans"
      />
    </Flex>
  );
};

/* -------------------------- Looping agents ----------------------------- */

const rateColor = (pct: number): string =>
  pct >= 50 ? "var(--red)" : pct >= 15 ? "var(--amber)" : "var(--green-2)";

export const LoopingAgentsBody = () => {
  const { rows, loopingCount, isLoading, isEmpty } = useAgentLoops();
  const series = useAgentLoopSeries(true);

  return (
    <Flex flexDirection="column" gap={16}>
      <StatStrip
        stats={[
          {
            label: "Agents with loops",
            value: fmtCount(loopingCount),
            color: loopingCount > 0 ? "var(--amber)" : undefined,
          },
          { label: "Node executions", value: fmtCount(series.total), sub: "this scope" },
          {
            label: "Worst loop rate",
            value: rows.length > 0 ? `${rows[0].loopRatePct.toFixed(1)}%` : "—",
            sub: rows.length > 0 && !rows[0].unattributed ? rows[0].agent : undefined,
          },
        ]}
      />

      <Flex flexDirection="column" gap={6}>
        <Text style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)" }}>
          LangGraph node executions over time
        </Text>
        {series.isLoading ? (
          <Skeleton style={{ height: 200 }} />
        ) : series.isEmpty ? (
          <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            No LangGraph node-execution spans in this scope.
          </Text>
        ) : (
          <AreaChart
            height={200}
            formatLeft={(n) => fmtCount(Math.round(n))}
            series={[{ label: "Node executions", color: "var(--purple)", values: series.values }]}
          />
        )}
      </Flex>

      {isLoading ? (
        <Flex flexDirection="column" gap={8}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} style={{ height: 28 }} />
          ))}
        </Flex>
      ) : isEmpty ? (
        <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
          No LangGraph execution spans in this scope — loop detection needs{" "}
          <code>traceloop.association.properties.langgraph_node</code>.
        </Text>
      ) : (
        <PopupTable
          rows={rows}
          maxHeight={300}
          empty="No looping agents detected."
          columns={[
            {
              key: "agent",
              header: "Agent",
              render: (r) =>
                r.unattributed ? (
                  <span style={{ color: "var(--text-4)", fontStyle: "italic", fontFamily: "var(--mono, monospace)" }}>
                    {r.agent}
                  </span>
                ) : (
                  <AgentCell agent={r.agent} />
                ),
            },
            {
              key: "rate",
              header: "Loop rate",
              width: 100,
              align: "right",
              render: (r) => (
                <span style={{ fontWeight: 600, color: rateColor(r.loopRatePct) }}>
                  {r.loopRatePct.toFixed(1)}%
                </span>
              ),
            },
            {
              key: "runs",
              header: "Looping / runs",
              width: 130,
              align: "right",
              render: (r) => `${fmtCount(r.loopingRuns)} / ${fmtCount(r.runs)}`,
            },
            {
              key: "rev",
              header: "Max revisits",
              width: 110,
              align: "right",
              render: (r) => (
                <span style={{ color: r.maxRepeat >= LOOP_REPEAT_RATIO ? "var(--amber)" : undefined }}>
                  {r.maxRepeat.toFixed(1)}×
                </span>
              ),
            },
            {
              key: "steps",
              header: "Max steps",
              width: 100,
              align: "right",
              render: (r) => (
                <span style={{ color: r.maxSteps >= LOOP_MAX_STEP ? "var(--amber)" : undefined }}>
                  {fmtCount(r.maxSteps)}
                </span>
              ),
            },
          ]}
        />
      )}

      <DataGapNote
        message="Loop detection is heuristic (revisit ratio + step depth). The 'unattributed' row is LangGraph activity on spans with no agent name."
        attributes={["gen_ai.agent.iteration", "gen_ai.agent.max_iterations", "traceloop.association.properties.thread_id"]}
        bestPractice="Emit agent iteration / max-iteration counters and a stable thread_id, and propagate agent identity to LangGraph spans, for exact non-termination detection instead of a revisit heuristic. See INSTRUMENTATION-REQUIREMENTS.md P2.4 / P0.1."
        href="https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/"
        hrefLabel="OTel GenAI spans"
      />
    </Flex>
  );
};
