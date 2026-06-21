import React, { useMemo, useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { ChevronDownIcon, ChevronRightIcon } from "@dynatrace/strato-icons";
import { fmtCount, fmtMs, fmtPercent, fmtUSD } from "../../data/format";
import {
  agentHealthScore,
  type AgentHealthStatus,
} from "../../components/SLAConfig/agentHealthScore";
import { useSLA } from "../../components/SLAConfig/SLAContext";
import { useTweaks } from "../../tweaks/TweaksContext";
import { FilterTrigger } from "../../components/FilterTrigger";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { ChartModal } from "../../components/charts/ChartExpander";
import { StageBreakdownBar } from "./StageBreakdownBar";
import { AgentToolsSubview } from "./AgentToolsSubview";
import { AgentTopologySubview } from "./AgentTopologySubview";
import { AgentContextStoresSubview } from "./AgentContextStoresSubview";
import { useHighFrequencyAgents } from "./useHighFrequencyAgents";
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

const SLOW_ROW_P90_MS = 5000;

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

/** The expandable / full-screen detail body: stage mix, percentiles, cost + tabs. */
const AgentDetailContent = ({ row }: { row: AgentRow }) => {
  const [tab, setTab] = useState<DetailTab>("tools");
  return (
    <Flex flexDirection="column" gap={8}>
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
        {tab === "tools" && <AgentToolsSubview agentName={row.agent} />}
        {tab === "topology" && <AgentTopologySubview agentName={row.agent} />}
        {tab === "context" && <AgentContextStoresSubview />}
      </div>
    </Flex>
  );
};

const ExpandedDetail = ({ row, onFullScreen }: { row: AgentRow; onFullScreen: () => void }) => (
  <Flex
    flexDirection="column"
    gap={8}
    style={{ padding: "12px 16px 16px", background: "var(--surface-2)", borderTop: "1px solid var(--border)" }}
  >
    <Flex justifyContent="flex-end">
      <FullScreenButton onClick={onFullScreen} />
    </Flex>
    <AgentDetailContent row={row} />
  </Flex>
);

export interface AgentsTableProps {
  rows: AgentRow[];
  isLoading: boolean;
  view: AgentView;
  operation: AgentOperation;
  onViewChange: (v: AgentView) => void;
  onOperationChange: (o: AgentOperation) => void;
}

export const AgentsTable = ({
  rows,
  isLoading,
  view,
  operation,
  onViewChange,
  onOperationChange,
}: AgentsTableProps) => {
  const { thresholds, hasActive } = useSLA();
  const { pageConfig } = useTweaks();
  const showTtft = pageConfig.agentsShowTtft;
  const highFreqAgents = useHighFrequencyAgents();
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
            {rows.length} {rows.length === 1 ? "agent" : "agents"}
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
        <HeaderCell width={140}>Stages</HeaderCell>
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
            const slow = r.p90Ms > SLOW_ROW_P90_MS;
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
                    background: slow
                      ? "color-mix(in oklab, var(--amber) 6%, transparent)"
                      : undefined,
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
                  <Cell width={80} align="right" mono color={slow ? "var(--amber)" : undefined}>
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
                  <Cell width={70} align="right" mono color={r.errorRatePct > 5 ? "var(--red)" : undefined}>
                    {r.errors > 0 ? fmtPercent(r.errorRatePct) : "0%"}
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
                {isExpanded && <ExpandedDetail row={r} onFullScreen={() => setFullScreen(r)} />}
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
            <AgentDetailContent row={fullScreen} />
          </Surface>
        )}
      </ChartModal>
    </CollapsibleCard>
  );
};
