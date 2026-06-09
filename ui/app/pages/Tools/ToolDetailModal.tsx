import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "@dynatrace/strato-components/overlays";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Skeleton } from "@dynatrace/strato-components/content";
import { ExternalLinkIcon } from "@dynatrace/strato-icons";
import { AreaChart, type AxisTick } from "../../components/charts/AreaChart";
import { FilterTrigger } from "../../components/FilterTrigger";
import { fmtCount, fmtMs, fmtPercent } from "../../data/format";
import { openInTraces, openInServices } from "../../lib/intents";
import { TraceTree } from "../Prompts/TraceTree";
import { useTraceSpans } from "../Prompts/useTraceSpans";
import { useToolDetail, type ToolTraceSample } from "./useToolDetail";
import type { Tool } from "./useTools";

type Tab = "overview" | "traces" | "topology" | "info";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "traces", label: "Traces" },
  { id: "topology", label: "Topology" },
  { id: "info", label: "Info" },
];

const Stat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <Flex flexDirection="column" gap={2} style={{ minWidth: 0 }}>
    <Text style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)" }}>
      {label}
    </Text>
    <Text style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: color ?? "var(--text)" }}>
      {value}
    </Text>
  </Flex>
);

const TabButton = ({ tab, active, onClick }: { tab: { id: Tab; label: string }; active: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      all: "unset",
      cursor: "pointer",
      padding: "6px 12px",
      fontSize: 12.5,
      fontWeight: active ? 700 : 500,
      color: active ? "var(--blue)" : "var(--text-2)",
      borderBottom: `2px solid ${active ? "var(--blue)" : "transparent"}`,
    }}
  >
    {tab.label}
  </button>
);

export interface ToolDetailModalProps {
  tool: Tool | null;
  show: boolean;
  onClose: () => void;
}

export const ToolDetailModal = ({ tool, show, onClose }: ToolDetailModalProps) => {
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  const detail = useToolDetail(tool?.tool ?? null);

  // Default the trace selection to the slowest sample when the data changes.
  useEffect(() => {
    setSelectedTraceId(detail.traces[0]?.traceId ?? null);
  }, [detail.traces]);

  // Reset to the overview tab each time a different tool is opened.
  useEffect(() => {
    setTab("overview");
  }, [tool?.tool]);

  const selectedTrace: ToolTraceSample | undefined = useMemo(
    () => detail.traces.find((t) => t.traceId === selectedTraceId),
    [detail.traces, selectedTraceId],
  );

  const traceSpans = useTraceSpans(
    tab === "traces" ? selectedTrace?.traceId ?? null : null,
    selectedTrace?.startMs,
  );

  const axisTicks = useMemo<AxisTick[]>(() => {
    const len = detail.series.labels.length;
    if (len <= 1) return [];
    const count = Math.min(6, len);
    return Array.from({ length: count }, (_, k) => {
      const idx = Math.round((k / (count - 1)) * (len - 1));
      return { index: idx, label: detail.series.labels[idx] ?? "" };
    });
  }, [detail.series.labels]);

  const openTrace = () => {
    if (selectedTrace) openInTraces({ traceId: selectedTrace.traceId, startMs: selectedTrace.startMs, entity: tool?.tool });
  };

  return (
    <Modal
      show={show}
      onDismiss={onClose}
      size="large"
      title={tool ? tool.tool : "Tool"}
      footer={
        <Flex justifyContent="space-between" alignItems="center" gap={8}>
          <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
            {tool ? `${tool.category} · ${tool.service}` : ""}
          </Text>
          <Flex gap={8}>
            <Button onClick={onClose}>Close</Button>
            {tab === "traces" && (
              <Button variant="accent" onClick={openTrace} disabled={!selectedTrace}>
                <Button.Prefix>
                  <ExternalLinkIcon />
                </Button.Prefix>
                Open in Distributed Tracing
              </Button>
            )}
            {tab === "topology" && (
              <Button variant="accent" onClick={() => openInServices({ entity: tool?.service })} disabled={!tool?.service}>
                <Button.Prefix>
                  <ExternalLinkIcon />
                </Button.Prefix>
                Open in Services
              </Button>
            )}
          </Flex>
        </Flex>
      }
    >
      {tool && (
        <Flex flexDirection="column" gap={12} style={{ minWidth: 0 }}>
          {/* Tab bar */}
          <Flex gap={4} style={{ borderBottom: "1px solid var(--border)" }}>
            {TABS.map((t) => (
              <TabButton key={t.id} tab={t} active={tab === t.id} onClick={() => setTab(t.id)} />
            ))}
          </Flex>

          {tab === "overview" && (
            <Flex flexDirection="column" gap={12}>
              <Surface elevation="flat" padding={12}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 12 }}>
                  <Stat label="Calls" value={fmtCount(tool.calls)} />
                  <Stat label="Avg" value={fmtMs(tool.avgMs)} />
                  <Stat label="P90" value={fmtMs(tool.p90Ms)} color={tool.p90Ms >= 5000 ? "var(--amber)" : undefined} />
                  <Stat label="P99" value={fmtMs(tool.p99Ms)} />
                  <Stat label="Err rate" value={fmtPercent(tool.errorRatePct, 2)} color={tool.errorRatePct > 0 ? "var(--red)" : undefined} />
                  <Stat label="Zone" value={tool.zone} />
                </div>
              </Surface>

              <Flex flexDirection="column" gap={6}>
                <Heading level={3} style={{ fontSize: 13, fontWeight: 600 }}>
                  Call volume &amp; p90 latency
                </Heading>
                <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                  Volume (area, left) and p90 latency (line, right) · {detail.series.intervalLabel} buckets
                </Text>
                {detail.isLoading ? (
                  <Skeleton style={{ height: 240 }} />
                ) : detail.series.calls.length <= 1 ? (
                  <Flex alignItems="center" justifyContent="center" style={{ height: 240, color: "var(--text-3)", fontSize: 12 }}>
                    Not enough data points to plot a trend in this window.
                  </Flex>
                ) : (
                  <AreaChart
                    height={240}
                    formatLeft={(n) => fmtCount(Math.round(n))}
                    formatRight={(n) => fmtMs(n)}
                    xLabels={detail.series.labels}
                    axisTicks={axisTicks}
                    series={[
                      { label: "Calls", color: "var(--blue)", values: detail.series.calls, axis: "left" },
                      { label: "p90 latency", color: "var(--purple-2)", values: detail.series.p90Ms, axis: "right" },
                    ]}
                  />
                )}
              </Flex>
            </Flex>
          )}

          {tab === "traces" && (
            <Flex flexDirection="column" gap={8}>
              <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                Sample traces containing this tool (slowest first). Select one to view its span waterfall, or open it full-screen in Distributed Tracing.
              </Text>
              <Flex gap={6} style={{ flexWrap: "wrap" }}>
                {detail.traces.map((t) => {
                  const active = t.traceId === selectedTraceId;
                  return (
                    <button
                      key={t.traceId}
                      type="button"
                      onClick={() => setSelectedTraceId(t.traceId)}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontVariantNumeric: "tabular-nums",
                        color: active ? "var(--blue)" : "var(--text-2)",
                        background: active ? "color-mix(in oklab, var(--blue) 14%, transparent)" : "var(--surface-3)",
                        border: `1px solid ${active ? "color-mix(in oklab, var(--blue) 40%, transparent)" : "var(--border)"}`,
                      }}
                    >
                      {fmtMs(t.durationMs)}
                      {t.isError && <span style={{ color: "var(--red)", marginLeft: 4 }}>•err</span>}
                    </button>
                  );
                })}
                {detail.traces.length === 0 && !detail.isLoading && (
                  <Text style={{ fontSize: 12, color: "var(--text-3)" }}>No sample traces found in this window.</Text>
                )}
              </Flex>
              <TraceTree
                spans={traceSpans.spans}
                isLoading={traceSpans.isLoading}
                highlight={(tool.tool ?? "").toLowerCase()}
                maxHeight={Math.round(window.innerHeight * 0.42)}
              />
            </Flex>
          )}

          {tab === "topology" && (
            <Flex flexDirection="column" gap={12}>
              <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                Where this tool runs and which agents invoke it. Open the owning service in the Services app for full topology.
              </Text>
              <Surface elevation="flat" padding={12}>
                <Flex flexDirection="column" gap={8}>
                  <Flex flexDirection="column" gap={2}>
                    <Text style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)" }}>
                      Owning service
                    </Text>
                    <Text style={{ fontSize: 13, fontFamily: "var(--font-mono, ui-monospace, monospace)" }}>
                      {tool.service || "—"}
                    </Text>
                  </Flex>
                  <Flex flexDirection="column" gap={4}>
                    <Text style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)" }}>
                      Calling agents ({tool.callingAgents.length})
                    </Text>
                    <Flex gap={6} style={{ flexWrap: "wrap" }}>
                      {tool.callingAgents.length === 0 ? (
                        <Text style={{ fontSize: 12, color: "var(--text-3)" }}>None recorded.</Text>
                      ) : (
                        tool.callingAgents.map((a) => (
                          <FilterTrigger key={a} attribute="gen_ai.agent.name" value={a} label={`agent ${a}`}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "3px 9px",
                                borderRadius: 999,
                                fontSize: 11,
                                background: "var(--surface-3)",
                                border: "1px solid var(--border)",
                                fontFamily: "var(--font-mono, ui-monospace, monospace)",
                              }}
                            >
                              {a}
                            </span>
                          </FilterTrigger>
                        ))
                      )}
                    </Flex>
                  </Flex>
                </Flex>
              </Surface>
            </Flex>
          )}

          {tab === "info" && (
            <Surface elevation="flat" padding={12}>
              <Flex flexDirection="column" gap={8}>
                {[
                  ["Tool", tool.tool],
                  ["Category", tool.category],
                  ["Service", tool.service || "—"],
                  ["MCP server", tool.mcpServer ?? "—"],
                  ["Calls", fmtCount(tool.calls)],
                  ["Avg latency", fmtMs(tool.avgMs)],
                  ["P90 latency", fmtMs(tool.p90Ms)],
                  ["P99 latency", fmtMs(tool.p99Ms)],
                  ["Errors", `${fmtCount(tool.errors)} (${fmtPercent(tool.errorRatePct, 2)})`],
                  ["Retry rate", fmtPercent(tool.retryRatePct, 2)],
                  ["Zone", tool.zone],
                ].map(([k, v]) => (
                  <Flex key={k} justifyContent="space-between" gap={12} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>
                    <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>{k}</Text>
                    <Text style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{v}</Text>
                  </Flex>
                ))}
                <Flex gap={8} style={{ marginTop: 4 }}>
                  <FilterTrigger attribute="span.name" value={tool.tool} label={`tool ${tool.tool}`}>
                    <span style={{ fontSize: 11.5, color: "var(--blue)", cursor: "pointer" }}>
                      Filter all pages by this tool →
                    </span>
                  </FilterTrigger>
                </Flex>
              </Flex>
            </Surface>
          )}
        </Flex>
      )}
    </Modal>
  );
};
