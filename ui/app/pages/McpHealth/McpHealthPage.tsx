import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { CriticalIcon, WarningIcon, CheckmarkIcon, ConnectorIcon } from "@dynatrace/strato-icons";
import { ErrorBanner } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { InfoTooltip } from "../../components/InfoTooltip";
import { fmtCount, fmtMs, fmtPercent } from "../../data/format";
import { tenantLabel, tenantUrl } from "../../lib/tenant";
import { useScope } from "../../scope/ScopeContext";
import { MCP_THRESHOLDS } from "./status";
import { useMcpHealth, type McpKpis, type McpAlert } from "./useMcpHealth";
import { McpActivityChart } from "./McpActivityChart";
import { McpToolTable } from "./McpToolTable";

/** Compact active-timeframe label for the subtitle. */
const timeframeLabel = (from: string, to?: string): string => {
  const m = /^now\(\)-(\d+)([smhd])$/i.exec(from);
  if (m && (!to || to === "now()")) {
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    const word =
      unit === "s" ? "second" : unit === "m" ? "minute" : unit === "h" ? "hour" : "day";
    return `Last ${n} ${word}${n === 1 ? "" : "s"}`;
  }
  return `${from} to ${to ?? "now()"}`;
};

const KpiCard = ({
  label,
  value,
  sub,
  color,
  info,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  info?: string;
}) => (
  <Surface elevation="raised" padding={12}>
    <Flex flexDirection="column" gap={6} style={{ minWidth: 0 }}>
      <Flex alignItems="center" gap={4} style={{ minHeight: 16 }}>
        <Text
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}
        >
          {label}
        </Text>
        {info && <InfoTooltip text={info} />}
      </Flex>
      <Text
        style={{
          fontSize: 22,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
          color: color ?? "var(--text)",
        }}
      >
        {value}
      </Text>
      {sub && <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{sub}</Text>}
    </Flex>
  </Surface>
);

const KpiSkeleton = () => (
  <Surface elevation="raised" padding={12}>
    <Flex flexDirection="column" gap={6}>
      <Skeleton style={{ height: 12, width: "60%" }} />
      <Skeleton style={{ height: 22, width: "80%" }} />
    </Flex>
  </Surface>
);

const errorRateColor = (pct: number): string => {
  if (pct <= 0) return "var(--green-2)";
  if (pct < MCP_THRESHOLDS.errorRateRedPct) return "var(--amber)";
  return "var(--red)";
};

const latencyKpiColor = (ms: number): string =>
  ms >= MCP_THRESHOLDS.kpiLatencyAmberMs ? "var(--amber)" : "var(--text)";

const KpiStrip = ({ kpis }: { kpis: McpKpis }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
      gap: 10,
    }}
  >
    <KpiCard
      label="MCP requests"
      value={fmtCount(kpis.mcpRequests)}
      info="Count of mcp.server spans (server-side request handling) in the active window."
    />
    <KpiCard
      label="Tool calls"
      value={fmtCount(kpis.toolCalls)}
      info="Total tool invocations across all MCP servers (spans where traceloop.span.kind is tool)."
    />
    <KpiCard
      label="Error rate"
      value={fmtPercent(kpis.errorRatePct, 2)}
      color={errorRateColor(kpis.errorRatePct)}
      info="Share of MCP and tool spans with span.status_code error, across all activity in the window."
    />
    <KpiCard
      label="Tool types"
      value={fmtCount(kpis.toolTypes)}
      info="Number of distinct tools invoked in the window."
    />
    <KpiCard
      label="p95 (server)"
      value={fmtMs(kpis.serverP95Ms)}
      color={latencyKpiColor(kpis.serverP95Ms)}
      info="95th percentile mcp.server span duration. Percentiles are sampling-invariant."
    />
    <KpiCard
      label="p99 (server)"
      value={fmtMs(kpis.serverP99Ms)}
      color={latencyKpiColor(kpis.serverP99Ms)}
      info="99th percentile mcp.server span duration."
    />
  </div>
);

const AlertRow = ({ alert }: { alert: McpAlert }) => (
  <Flex
    alignItems="center"
    gap={8}
    style={{
      padding: "8px 12px",
      borderRadius: 8,
      background: `color-mix(in oklab, ${alert.color} 10%, var(--surface))`,
      border: `1px solid color-mix(in oklab, ${alert.color} 40%, transparent)`,
    }}
  >
    {alert.tone === "red" ? (
      <CriticalIcon size={16} style={{ color: alert.color, flex: "0 0 auto" }} />
    ) : (
      <WarningIcon size={16} style={{ color: alert.color, flex: "0 0 auto" }} />
    )}
    <Text style={{ fontSize: 12, color: "var(--text)", flex: 1 }}>
      <strong>{alert.tool}</strong> · {alert.message}
    </Text>
  </Flex>
);

const HealthyRow = () => (
  <Flex
    alignItems="center"
    gap={8}
    style={{
      padding: "8px 12px",
      borderRadius: 8,
      background: "color-mix(in oklab, var(--green-2) 10%, var(--surface))",
      border: "1px solid color-mix(in oklab, var(--green-2) 40%, transparent)",
    }}
  >
    <CheckmarkIcon size={16} style={{ color: "var(--green-2)", flex: "0 0 auto" }} />
    <Text style={{ fontSize: 12, color: "var(--text)", flex: 1 }}>
      All MCP servers and tools are healthy in this window. No error or latency
      breaches detected.
    </Text>
  </Flex>
);

const AlertBand = ({
  alerts,
  isLoading,
  isEmpty,
}: {
  alerts: McpAlert[];
  isLoading: boolean;
  isEmpty: boolean;
}) => {
  if (isLoading) return <Skeleton style={{ height: 36 }} />;
  if (isEmpty) return null;
  return (
    <Flex flexDirection="column" gap={6}>
      {alerts.length === 0 ? (
        <HealthyRow />
      ) : (
        alerts.map((a) => <AlertRow key={a.key} alert={a} />)
      )}
    </Flex>
  );
};

const InstrumentationNote = () => (
  <Surface elevation="flat" padding={12}>
    <Text style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.6 }}>
      Tools are identified via <code>traceloop.span.kind</code> because this
      tenant does not emit the OpenTelemetry MCP semantic conventions. Per-method
      breakdown and session stability are unavailable because{" "}
      <code>mcp.method.name</code> and <code>session.id</code> are not populated.
      Powered by Dynatrace Intelligence on{" "}
      <a
        href={tenantUrl()}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "var(--blue)" }}
      >
        {tenantLabel()}
      </a>
      .
    </Text>
  </Surface>
);

export const McpHealthPage = () => {
  const { scope } = useScope();
  const health = useMcpHealth();
  const subtitle = `${tenantLabel()} · ${timeframeLabel(scope.timeframe.from, scope.timeframe.to)}`;

  return (
    <div style={{ padding: "18px 20px 80px" }}>
      <Flex flexDirection="column" gap={16} style={{ minWidth: 0 }}>
        <Flex flexDirection="column" gap={2}>
          <Flex alignItems="center" gap={8}>
            <ConnectorIcon size={20} style={{ color: "var(--blue)" }} />
            <Heading level={1} style={{ fontSize: 20, fontWeight: 600 }}>
              MCP & Tool Health
            </Heading>
          </Flex>
          <Text style={{ fontSize: 12, color: "var(--text-3)" }}>{subtitle}</Text>
        </Flex>

        {health.error && <ErrorBanner error={health.error} />}

        {health.isEmpty && !health.error ? (
          <EmptyState
            title="No MCP or tool activity detected in this window"
            description="No mcp.server spans or tool spans were found for the active timeframe, segments, and filters. Try widening the timeframe or clearing filters."
            icon={<ConnectorIcon size={28} />}
          />
        ) : (
          <>
            {health.isLoading && !health.kpis.total ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: 10,
                }}
              >
                {Array.from({ length: 6 }).map((_, i) => (
                  <KpiSkeleton key={i} />
                ))}
              </div>
            ) : (
              <KpiStrip kpis={health.kpis} />
            )}

            <AlertBand
              alerts={health.alerts}
              isLoading={health.isLoading && !health.kpis.total}
              isEmpty={health.isEmpty}
            />

            <McpActivityChart series={health.series} isLoading={health.isLoading} />

            <McpToolTable rows={health.rows} isLoading={health.isLoading} />
          </>
        )}

        <InstrumentationNote />
      </Flex>
    </div>
  );
};
