import React, { useMemo, useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
} from "@dynatrace/strato-icons";
import { fmtCount, fmtMs, fmtPercent } from "../../data/format";
import { FilterTrigger } from "../../components/FilterTrigger";
import { useTweaks } from "../../tweaks/TweaksContext";
import { CATEGORY_COLOR } from "./categories";
import type { Tool, ToolZone } from "./useTools";
import { ZONE_LABEL } from "./useTools";

type SortKey =
  | "tool"
  | "calls"
  | "avgMs"
  | "p90Ms"
  | "p99Ms"
  | "errorRatePct"
  | "retryRatePct";

interface Column {
  id: string;
  label: string;
  width?: number;
  align?: "left" | "right";
  sortBy?: SortKey;
}

const COLS: Column[] = [
  { id: "category", label: "", width: 12 },
  { id: "tool", label: "Tool", sortBy: "tool" },
  { id: "service", label: "Service", width: 140 },
  { id: "mcp", label: "MCP server", width: 130 },
  { id: "calls", label: "Calls", width: 80, align: "right", sortBy: "calls" },
  { id: "avg", label: "Avg", width: 80, align: "right", sortBy: "avgMs" },
  { id: "p90", label: "P90", width: 80, align: "right", sortBy: "p90Ms" },
  { id: "p99", label: "P99", width: 80, align: "right", sortBy: "p99Ms" },
  { id: "err", label: "Err", width: 70, align: "right", sortBy: "errorRatePct" },
  {
    id: "retry",
    label: "Retry",
    width: 80,
    align: "right",
    sortBy: "retryRatePct",
  },
  { id: "agents", label: "Agents", width: 180 },
  { id: "drill", label: "", width: 24 },
];

const CategoryChip = ({ tool }: { tool: Tool }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "2px 8px",
      borderRadius: 999,
      border: `1px solid color-mix(in oklab, ${CATEGORY_COLOR[tool.category]} 40%, transparent)`,
      background: `color-mix(in oklab, ${CATEGORY_COLOR[tool.category]} 12%, transparent)`,
      fontSize: 10.5,
      fontWeight: 600,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: CATEGORY_COLOR[tool.category],
    }}
  >
    {tool.category}
  </span>
);

const Cell = ({
  children,
  width,
  align,
  mono,
  color,
}: {
  children: React.ReactNode;
  width?: number;
  align?: "left" | "right";
  mono?: boolean;
  color?: string;
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
    }}
  >
    {children}
  </div>
);

export interface ToolsTableProps {
  tools: Tool[];
  isLoading: boolean;
  highlightZone: ToolZone | null;
  /** Open the tool detail modal. Row click; the inline name/service chips keep
   *  their click-to-filter behaviour (they stop propagation). */
  onSelectTool?: (tool: Tool) => void;
}

export const ToolsTable = ({
  tools,
  isLoading,
  highlightZone,
  onSelectTool,
}: ToolsTableProps) => {
  const { pageConfig } = useTweaks();
  // In discovered mode a tool is a span.name; in strict mode it's
  // gen_ai.tool.name — filter on whichever backs the current view.
  const toolAttr =
    pageConfig.toolsMode === "discovered" ? "span.name" : "gen_ai.tool.name";
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "calls",
    dir: "desc",
  });

  const sorted = useMemo(() => {
    const copy = [...tools];
    copy.sort((a, b) => {
      const k = sort.key;
      if (k === "tool") {
        const cmp = a.tool.localeCompare(b.tool);
        return sort.dir === "asc" ? cmp : -cmp;
      }
      const av = a[k];
      const bv = b[k];
      const cmp = av - bv;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [tools, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );

  return (
    <Surface elevation="raised" padding={0}>
      <Flex flexDirection="column" gap={0}>
        <Flex
          alignItems="center"
          justifyContent="space-between"
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            All tools
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            {tools.length} {tools.length === 1 ? "tool" : "tools"}
            {highlightZone && ` · zone: ${ZONE_LABEL[highlightZone]}`}
          </Text>
        </Flex>

        <Flex
          alignItems="center"
          style={{ padding: "0 10px", borderBottom: "1px solid var(--border)" }}
        >
          {COLS.map((c) => {
            const active = c.sortBy && sort.key === c.sortBy;
            const Arrow =
              active && sort.dir === "asc" ? ChevronUpIcon : ChevronDownIcon;
            return (
              <button
                key={c.id}
                type="button"
                disabled={!c.sortBy}
                onClick={() => c.sortBy && toggleSort(c.sortBy)}
                style={{
                  all: "unset",
                  cursor: c.sortBy ? "pointer" : "default",
                  flex: c.width ? "0 0 auto" : 1,
                  width: c.width,
                  textAlign: c.align,
                  padding: "8px 6px",
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: active ? "var(--text)" : "var(--text-3)",
                }}
              >
                <Flex
                  alignItems="center"
                  justifyContent={
                    c.align === "right" ? "flex-end" : "flex-start"
                  }
                  gap={2}
                >
                  {c.label}
                  {active && <Arrow size={12} />}
                </Flex>
              </button>
            );
          })}
        </Flex>

        {isLoading && sorted.length === 0 ? (
          <Flex flexDirection="column" gap={4} style={{ padding: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 36 }} />
            ))}
          </Flex>
        ) : sorted.length === 0 ? (
          <Flex style={{ padding: "32px 16px" }}>
            <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
              No tools match the current filter.
            </Text>
          </Flex>
        ) : (
          sorted.map((t) => (
            <div
              key={`${t.service}-${t.tool}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelectTool?.(t)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectTool?.(t);
                }
              }}
              className="aaa-attr-cell"
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0 10px",
                borderTop: "1px solid var(--border)",
                cursor: onSelectTool ? "pointer" : "default",
              }}
            >
              <Cell width={12}>
                <span
                  aria-hidden
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: t.color,
                  }}
                />
              </Cell>
              <Cell mono>
                <Flex alignItems="center" gap={6}>
                  <FilterTrigger
                    attribute={toolAttr}
                    value={t.tool}
                    label="tool"
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.tool}
                    </span>
                  </FilterTrigger>
                  <CategoryChip tool={t} />
                </Flex>
              </Cell>
              <Cell width={140} mono color="var(--text-2)">
                {t.service ? (
                  <FilterTrigger
                    attribute="service.name"
                    value={t.service}
                    label="service"
                  >
                    {t.service}
                  </FilterTrigger>
                ) : (
                  t.service
                )}
              </Cell>
              <Cell width={130} mono color="var(--text-2)">
                {t.mcpServer ?? "—"}
              </Cell>
              <Cell width={80} align="right" mono>
                {fmtCount(t.calls)}
              </Cell>
              <Cell
                width={80}
                align="right"
                mono
                color={t.avgMs > 5000 ? "var(--amber)" : undefined}
              >
                {fmtMs(t.avgMs)}
              </Cell>
              <Cell width={80} align="right" mono>
                {fmtMs(t.p90Ms)}
              </Cell>
              <Cell
                width={80}
                align="right"
                mono
                color={t.p99Ms > 10_000 ? "var(--red)" : undefined}
              >
                {fmtMs(t.p99Ms)}
              </Cell>
              <Cell
                width={70}
                align="right"
                mono
                color={t.errorRatePct > 5 ? "var(--red)" : undefined}
              >
                {t.errors > 0 ? fmtPercent(t.errorRatePct) : "0%"}
              </Cell>
              <Cell
                width={80}
                align="right"
                mono
                color={t.retryRatePct > 5 ? "var(--amber)" : undefined}
              >
                {t.retryTotal > 0 ? fmtPercent(t.retryRatePct, 2) : "0%"}
              </Cell>
              <Cell width={180} color="var(--text-2)">
                {t.callingAgents.length > 0 ? (
                  <span
                    title={t.callingAgents.join(", ")}
                    style={{ fontFamily: "var(--mono, monospace)", fontSize: 12 }}
                  >
                    {t.callingAgents.slice(0, 2).join(", ")}
                    {t.callingAgents.length > 2 &&
                      ` +${t.callingAgents.length - 2}`}
                  </span>
                ) : (
                  <Text style={{ fontSize: 11, color: "var(--text-4)" }}>—</Text>
                )}
              </Cell>
              <Cell width={24}>
                <ChevronRightIcon size={14} style={{ color: "var(--text-3)" }} />
              </Cell>
            </div>
          ))
        )}
      </Flex>
    </Surface>
  );
};
