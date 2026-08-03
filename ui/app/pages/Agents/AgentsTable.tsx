import React, { useMemo, useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { ChevronDownIcon, ChevronRightIcon, WarningIcon } from "@dynatrace/strato-icons";
import { fmtCount, fmtMs, fmtPercent, fmtUSD } from "../../data/format";
import {
  agentHealthScore,
  type AgentHealthStatus,
} from "../../components/SLAConfig/agentHealthScore";
import { useSLA } from "../../components/SLAConfig/SLAContext";
import { useTweaks } from "../../tweaks/TweaksContext";
import { FilterTrigger } from "../../components/FilterTrigger";
import { InfoTooltip } from "../../components/InfoTooltip";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { ChartModal } from "../../components/charts/ChartExpander";
import { StageBreakdownBar } from "./StageBreakdownBar";
import { AgentToolsSubview } from "./AgentToolsSubview";
import { AgentTopologySubview } from "./AgentTopologySubview";
import { AgentContextStoresSubview } from "./AgentContextStoresSubview";
import { useHighFrequencyAgents } from "./useHighFrequencyAgents";
import { useAgentLoops } from "./useAgentLoops";
import { latencySeverity, type LatencySeverity } from "./latency";
import { buildAgentVerdict } from "./verdict";
import { agentsViewSummary } from "./viewSummary";
import {
  AgentsSegmentedControls,
  type AgentOperation,
  type AgentView,
} from "./AgentsViewRow";
import type { AgentRow } from "./useAgents";

const STATUS_COLOR: Record<AgentHealthStatus, string> = {
  healthy: "var(--green-2)",
  warning: "var(--amber)",
  breached: "var(--red)",
};

const STATUS_LABEL: Record<AgentHealthStatus, string> = {
  healthy: "Healthy",
  warning: "Warning",
  breached: "Breached",
};

// Non-"ok" latency tiers drive both the row text color and the raised-contrast
// row tint, so the table agrees with the Slow tile / View that produced it.
const SEV_TEXT: Record<Exclude<LatencySeverity, "ok">, string> = {
  slow: "var(--amber)",
  runaway: "var(--red)",
};
const SEV_TINT: Record<Exclude<LatencySeverity, "ok">, string> = {
  slow: "color-mix(in oklab, var(--amber) 12%, transparent)",
  runaway: "color-mix(in oklab, var(--red) 12%, transparent)",
};

type SortKey =
  | "agent"
  | "service"
  | "invocations"
  | "p90Ms"
  | "p99Ms"
  | "ttftMs"
  | "errorRatePct"
  | "costPerInvocation";

const HeaderCell = ({
  children,
  width,
  align,
  sortCol,
  sortKey,
  dir,
  onSort,
}: {
  children: React.ReactNode;
  width?: number;
  align?: "left" | "right";
  sortCol?: SortKey;
  sortKey?: SortKey;
  dir?: "asc" | "desc";
  onSort?: (k: SortKey) => void;
}) => {
  const sortable = sortCol != null && onSort != null;
  return (
    <div
      onClick={sortCol != null && onSort != null ? () => onSort(sortCol) : undefined}
      style={{
        flex: width ? "0 0 auto" : 1,
        width,
        textAlign: align,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color: "var(--text-3)",
        padding: "8px 6px",
        cursor: sortable ? "pointer" : undefined,
        userSelect: sortable ? "none" : undefined,
      }}
    >
      {children}
      {sortable && (
        <span style={{ marginLeft: 4, color: sortKey === sortCol ? "var(--text-2)" : "var(--text-4)" }}>
          {sortKey === sortCol ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      )}
    </div>
  );
};

const Cell = ({
  children,
  width,
  align,
  mono,
  color,
  style,
}: {
  children: React.ReactNode;
  width?: number;
  align?: "left" | "right";
  mono?: boolean;
  color?: string;
  style?: React.CSSProperties;
}) => (
  <div
    style={{
      flex: width ? "0 0 auto" : 1,
      width,
      minWidth: 0,
      textAlign: align,
      padding: "8px 6px",
      fontSize: 12.5,
      color: color ?? "var(--text)",
      fontFamily: mono ? "var(--mono, monospace)" : undefined,
      fontVariantNumeric: mono ? "tabular-nums" : undefined,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </div>
);

const TTFTValue = ({ value }: { value: number | null }) =>
  value == null ? (
    <Text
      style={{ fontFamily: "var(--mono, monospace)", fontSize: 12.5, color: "var(--text-4)" }}
      title="Requires gen_ai.response.ttft"
    >
      —
    </Text>
  ) : (
    <Text style={{ fontFamily: "var(--mono, monospace)", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
      {fmtMs(value)}
    </Text>
  );

type DetailTab = "tools" | "topology" | "context";

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "tools", label: "Tools" },
  { id: "topology", label: "Topology" },
  { id: "context", label: "Context stores" },
];

const SubTabBar = ({
  active,
  onSelect,
}: {
  active: DetailTab;
  onSelect: (t: DetailTab) => void;
}) => (
  <Flex gap={4} style={{ borderBottom: "1px solid var(--border)" }}>
    {DETAIL_TABS.map((t) => (
      <button
        key={t.id}
        type="button"
        onClick={() => onSelect(t.id)}
        aria-current={active === t.id ? "true" : undefined}
        style={{
          all: "unset",
          cursor: "pointer",
          padding: "6px 12px",
          fontSize: 12.5,
          fontWeight: active === t.id ? 600 : 400,
          color: active === t.id ? "var(--text-1)" : "var(--text-3)",
          borderBottom:
            active === t.id ? "2px solid var(--accent, var(--blue-2))" : "2px solid transparent",
        }}
      >
        {t.label}
      </button>
    ))}
  </Flex>
);

/** Maximize (full-screen) glyph button. */
const FullScreenButton = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Open agent in full screen"
    title="Full screen"
    style={{
      all: "unset",
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 10px",
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 600,
      color: "var(--text-2)",
      background: "var(--surface)",
      border: "1px solid var(--border)",
    }}
  >
    <svg width={13} height={13} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 5V2h3M9 2h3v3M12 9v3H9M5 12H2V9" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    Full screen
  </button>
);

/** One-line synthesized "why this agent is flagged" verdict, combining P90
 * severity, dominant tier, error rate, loop rate and high-tool-frequency so the
 * user doesn't have to join four separate panels. Hidden when nothing is
 * notable. */
const AgentVerdict = ({ parts }: { parts: string[] }) => {
  if (parts.length === 0) return null;
  return (
    <Flex
      alignItems="center"
      gap={6}
      style={{
        padding: "6px 10px",
        borderRadius: 6,
        background: "color-mix(in oklab, var(--amber) 10%, var(--surface))",
        border: "1px solid color-mix(in oklab, var(--amber) 30%, transparent)",
        flexWrap: "wrap",
      }}
    >
      <WarningIcon size={13} style={{ color: "var(--amber)", flex: "0 0 auto" }} aria-hidden />
      <Text style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
        Why flagged:
      </Text>
      <Text style={{ fontSize: 12, color: "var(--text-2)" }}>
        {parts.join(" · ")}
      </Text>
    </Flex>
  );
};

/** The expandable / full-screen detail body: stage mix, percentiles, cost + tabs. */
const AgentDetailContent = ({
  row,
  verdict,
  showExample = false,
}: {
  row: AgentRow;
  verdict: string[];
  showExample?: boolean;
}) => {
  const [tab, setTab] = useState<DetailTab>("tools");
  return (
    <Flex flexDirection="column" gap={8}>
      <AgentVerdict parts={verdict} />
      <Flex justifyContent="space-between" gap={12} style={{ flexWrap: "wrap" }}>
        <Flex flexDirection="column" gap={4} style={{ minWidth: 220 }}>
          <Text style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)" }}>
            Stage mix (share of child spans)
          </Text>
          <StageBreakdownBar stage={row.stage} height={10} showLegend />
          <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
            Share of this agent's own spans by stage. LLM is typically ~0 because
            model calls run on the shared proxy in a separate trace — see "Latency
            by execution tier" for the LLM share of total time.
          </Text>
        </Flex>
        <Flex flexDirection="column" gap={4} style={{ minWidth: 180 }}>
          <Text style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)" }}>
            Latency percentiles
          </Text>
          <Text style={{ fontSize: 12.5 }}>P50 {fmtMs(row.p50Ms)}</Text>
          <Text style={{ fontSize: 12.5 }}>P90 {fmtMs(row.p90Ms)}</Text>
          <Text style={{ fontSize: 12.5 }}>P99 {fmtMs(row.p99Ms)}</Text>
          <Text style={{ fontSize: 12.5 }}>Avg {fmtMs(row.avgMs)}</Text>
        </Flex>
        <Flex flexDirection="column" gap={4} style={{ minWidth: 200 }}>
          <Text style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)" }}>
            Cost
          </Text>
          {row.costAttributed ? (
            <>
              <Text style={{ fontSize: 12.5 }}>Input tokens {fmtCount(row.inputTokens)}</Text>
              <Text style={{ fontSize: 12.5 }}>Output tokens {fmtCount(row.outputTokens)}</Text>
              <Text style={{ fontSize: 12.5 }}>Cost / invocation {fmtUSD(row.costPerInvocation)}</Text>
              <Text style={{ fontSize: 12.5 }}>
                Total cost {fmtUSD(row.cost)} ({row.models.join(", ") || "model unknown"})
              </Text>
            </>
          ) : (
            <Text style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.5 }}>
              No cost attributable. This agent's LLM calls run through the central
              proxy (<code>bos-proxy-core</code>) in a separate trace, so token
              usage can't be tied back to it via <code>trace.id</code>. Agents
              whose model calls share their trace (e.g. LangChain-instrumented
              ones) do show cost. Fleet cost is exact on the Models and FinOps
              tabs.
            </Text>
          )}
        </Flex>
      </Flex>

      <SubTabBar active={tab} onSelect={setTab} />
      <div style={{ paddingTop: 8 }}>
        {tab === "tools" && <AgentToolsSubview agentName={row.agent} showExample={showExample} />}
        {tab === "topology" && <AgentTopologySubview agentName={row.agent} />}
        {tab === "context" && <AgentContextStoresSubview />}
      </div>
    </Flex>
  );
};

const ExpandedDetail = ({
  row,
  verdict,
  onFullScreen,
  showExample,
}: {
  row: AgentRow;
  verdict: string[];
  onFullScreen: () => void;
  showExample: boolean;
}) => (
  <Flex
    flexDirection="column"
    gap={8}
    style={{ padding: "12px 16px 16px", background: "var(--surface-2)", borderTop: "1px solid var(--border)" }}
  >
    <Flex justifyContent="flex-end">
      <FullScreenButton onClick={onFullScreen} />
    </Flex>
    <AgentDetailContent row={row} verdict={verdict} showExample={showExample} />
  </Flex>
);

export interface AgentsTableProps {
  rows: AgentRow[];
  isLoading: boolean;
  view: AgentView;
  operation: AgentOperation;
  onViewChange: (v: AgentView) => void;
  onOperationChange: (o: AgentOperation) => void;
  /** Demo Mode / no-telemetry fallback — see BedrockPage's doc comment. */
  showExample?: boolean;
}

export const AgentsTable = ({
  rows,
  isLoading,
  view,
  operation,
  onViewChange,
  onOperationChange,
  showExample = false,
}: AgentsTableProps) => {
  const { thresholds, hasActive } = useSLA();
  const { pageConfig } = useTweaks();
  const showTtft = pageConfig.agentsShowTtft;
  const highFreqAgents = useHighFrequencyAgents(showExample);
  const loops = useAgentLoops(showExample);
  const loopRateByAgent = useMemo(() => {
    const m = new Map<string, number>();
    for (const lr of loops.rows) {
      if (!lr.unattributed) m.set(lr.agent, lr.loopRatePct);
    }
    return m;
  }, [loops.rows]);
  const verdictFor = (r: AgentRow): string[] =>
    buildAgentVerdict({
      p90Ms: r.p90Ms,
      errorRatePct: r.errorRatePct,
      stage: r.stage,
      loopRatePct: loopRateByAgent.get(r.agent),
      highFrequency: highFreqAgents.has(r.agent),
    });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fullScreen, setFullScreen] = useState<AgentRow | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("invocations");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const toggle = (id: string) => setExpanded((current) => (current === id ? null : id));

  const onSort = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setDir(k === "agent" || k === "service" ? "asc" : "desc");
    }
  };

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let cmp: number;
      if (sortKey === "agent") cmp = a.agent.localeCompare(b.agent);
      else if (sortKey === "service") cmp = (a.service || "").localeCompare(b.service || "");
      else if (sortKey === "ttftMs") {
        // Nulls sort last regardless of direction.
        const av = a.ttftMs ?? -Infinity;
        const bv = b.ttftMs ?? -Infinity;
        cmp = av - bv;
      } else cmp = a[sortKey] - b[sortKey];
      return dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, dir]);

  return (
    <CollapsibleCard
      title="Agents"
      info="Every agent in the current view (filtered by the View / Operation selectors in this header). Click a column to sort. Click a row to expand stage mix, latency percentiles, cost attribution and per-agent Tools / Topology / Context stores; '$/inv' shows '—' when LLM cost can't be tied to the agent via a shared trace. The ⚠ badge flags possible N+1 tool loops."
      defaultOpen
      headerRight={
        <Flex alignItems="center" gap={16} style={{ flexWrap: "wrap" }}>
          <AgentsSegmentedControls
            view={view}
            operation={operation}
            onViewChange={onViewChange}
            onOperationChange={onOperationChange}
          />
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            {agentsViewSummary(view, rows.length)}
          </Text>
        </Flex>
      }
    >
      <Flex
        alignItems="center"
        style={{ padding: "0 10px", background: "var(--surface)" }}
      >
        <HeaderCell width={24}>{""}</HeaderCell>
        <HeaderCell sortCol="agent" sortKey={sortKey} dir={dir} onSort={onSort}>Agent</HeaderCell>
        <HeaderCell width={140} sortCol="service" sortKey={sortKey} dir={dir} onSort={onSort}>Service</HeaderCell>
        <HeaderCell width={80} align="right" sortCol="invocations" sortKey={sortKey} dir={dir} onSort={onSort}>Inv</HeaderCell>
        <HeaderCell width={80} align="right" sortCol="p90Ms" sortKey={sortKey} dir={dir} onSort={onSort}>P90</HeaderCell>
        <HeaderCell width={80} align="right" sortCol="p99Ms" sortKey={sortKey} dir={dir} onSort={onSort}>P99</HeaderCell>
        {showTtft && (
          <HeaderCell width={80} align="right" sortCol="ttftMs" sortKey={sortKey} dir={dir} onSort={onSort}>TTFT</HeaderCell>
        )}
        <HeaderCell width={70} align="right" sortCol="errorRatePct" sortKey={sortKey} dir={dir} onSort={onSort}>Err</HeaderCell>
        <HeaderCell width={100} align="right" sortCol="costPerInvocation" sortKey={sortKey} dir={dir} onSort={onSort}>$/inv</HeaderCell>
        <HeaderCell width={140}>
          <Flex alignItems="center" gap={4}>
            Span mix
            <InfoTooltip text="Share of this agent's own child spans by tier — LLM=purple, Tool=amber, Retrieval=cyan, Orchestration=slate. LLM is ~0 by design because model calls run on the shared proxy in a separate trace, so this is a span-count mix, not where time goes. See 'Latency by execution tier' for the time view." />
          </Flex>
        </HeaderCell>
        {hasActive && <HeaderCell width={100}>SLA health</HeaderCell>}
      </Flex>

      {isLoading && rows.length === 0 ? (
        <Flex flexDirection="column" gap={4} style={{ padding: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} style={{ height: 36 }} />
          ))}
        </Flex>
      ) : rows.length === 0 ? (
        <Flex style={{ padding: "32px 16px" }}>
          <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            No agents match the current view.
          </Text>
        </Flex>
      ) : (
        // Cap height and scroll the rest, so the table doesn't dominate the page.
        <div style={{ maxHeight: 620, overflowY: "auto" }}>
          {sortedRows.map((r) => {
            const id = `${r.serviceId}-${r.agent}`;
            const isExpanded = expanded === id;
            const sev = latencySeverity(r.p90Ms);
            const slow = sev !== "ok";
            const rowTint = sev === "ok" ? undefined : SEV_TINT[sev];
            const p90Color = sev === "ok" ? undefined : SEV_TEXT[sev];
            const highError = r.errorRatePct > 5;
            const verdict = verdictFor(r);
            const health = hasActive
              ? agentHealthScore(
                  {
                    p90Ms: r.p90Ms,
                    p99Ms: r.p99Ms,
                    errorRatePct: r.errorRatePct,
                    costPerInvocation: r.costPerInvocation,
                  },
                  thresholds,
                )
              : null;
            return (
              <React.Fragment key={id}>
                <div
                  role="row"
                  tabIndex={0}
                  onClick={() => toggle(id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(id);
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "0 10px",
                    borderTop: "1px solid var(--border)",
                    cursor: "pointer",
                    background: rowTint,
                  }}
                >
                  <Cell width={24}>
                    {isExpanded ? (
                      <ChevronDownIcon size={14} style={{ color: "var(--text-3)" }} />
                    ) : (
                      <ChevronRightIcon size={14} style={{ color: "var(--text-3)" }} />
                    )}
                  </Cell>
                  <Cell mono>
                    <FilterTrigger attribute="gen_ai.agent.name" value={r.agent} label="agent">
                      {r.agent}
                    </FilterTrigger>
                    {r.framework && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 10.5,
                          padding: "1px 6px",
                          borderRadius: 6,
                          background: "var(--surface-3)",
                          color: "var(--text-2)",
                          whiteSpace: "nowrap",
                        }}
                        title={`Orchestration framework: ${r.framework}`}
                      >
                        {r.framework}
                      </span>
                    )}
                    {highFreqAgents.has(r.agent) && (
                      <span
                        title="A single tool was called above the high-frequency threshold for this agent (possible N+1 / tool loop). See the Tools sub-view."
                        style={{
                          marginLeft: 6,
                          fontSize: 9.5,
                          fontWeight: 600,
                          color: "var(--amber)",
                          border: "1px solid var(--amber)",
                          borderRadius: 4,
                          padding: "0 4px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        ⚠ high tool frequency
                      </span>
                    )}
                  </Cell>
                  <Cell width={140} mono color="var(--text-2)">
                    {r.service ? (
                      <FilterTrigger attribute="service.name" value={r.service} label="service">
                        {r.service}
                      </FilterTrigger>
                    ) : (
                      r.service
                    )}
                  </Cell>
                  <Cell width={80} align="right" mono>
                    {fmtCount(r.invocations)}
                  </Cell>
                  <Cell width={80} align="right" mono color={p90Color}>
                    {slow && (
                      <WarningIcon
                        size={11}
                        aria-hidden
                        style={{ verticalAlign: "-1px", marginRight: 3 }}
                      />
                    )}
                    {fmtMs(r.p90Ms)}
                  </Cell>
                  <Cell width={80} align="right" mono>
                    {fmtMs(r.p99Ms)}
                  </Cell>
                  {showTtft && (
                    <Cell width={80} align="right">
                      <TTFTValue value={r.ttftMs} />
                    </Cell>
                  )}
                  <Cell width={70} align="right" mono color={highError ? "var(--red)" : undefined}>
                    {r.errors > 0 ? (
                      <>
                        {highError && (
                          <WarningIcon
                            size={11}
                            aria-hidden
                            style={{ verticalAlign: "-1px", marginRight: 3 }}
                          />
                        )}
                        {fmtPercent(r.errorRatePct)}
                      </>
                    ) : (
                      "0%"
                    )}
                  </Cell>
                  <Cell width={100} align="right" mono>
                    {r.costAttributed ? (
                      fmtUSD(r.costPerInvocation)
                    ) : (
                      <Text
                        style={{ fontFamily: "var(--mono, monospace)", fontSize: 12.5, color: "var(--text-4)" }}
                        title="LLM tokens for this agent run through the central proxy in a separate trace and can't be attributed. Cost is shown where an LLM span shares the agent's trace."
                      >
                        —
                      </Text>
                    )}
                  </Cell>
                  <Cell width={140} style={{ overflow: "visible" }}>
                    <StageBreakdownBar stage={r.stage} />
                  </Cell>
                  {hasActive && health && (
                    <Cell width={100}>
                      <Flex alignItems="center" gap={6}>
                        <span
                          aria-hidden
                          style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLOR[health.status], flex: "0 0 auto" }}
                        />
                        <Text
                          style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: STATUS_COLOR[health.status] }}
                          title={health.breaches.join("\n")}
                        >
                          {health.score} · {STATUS_LABEL[health.status]}
                        </Text>
                      </Flex>
                    </Cell>
                  )}
                </div>
                {isExpanded && (
                  <ExpandedDetail
                    row={r}
                    verdict={verdict}
                    onFullScreen={() => setFullScreen(r)}
                    showExample={showExample}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      <ChartModal
        open={fullScreen !== null}
        onClose={() => setFullScreen(null)}
        title={fullScreen?.agent ?? ""}
        subtitle={
          fullScreen
            ? `${fullScreen.service || "service unknown"} · ${fmtCount(fullScreen.invocations)} invocations · P90 ${fmtMs(fullScreen.p90Ms)}`
            : undefined
        }
      >
        {fullScreen && (
          <Surface elevation="raised" padding={16}>
            <AgentDetailContent row={fullScreen} verdict={verdictFor(fullScreen)} showExample={showExample} />
          </Surface>
        )}
      </ChartModal>
    </CollapsibleCard>
  );
};
