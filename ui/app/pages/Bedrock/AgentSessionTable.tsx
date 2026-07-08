import React, { useMemo, useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { ChevronDownIcon, ChevronUpIcon } from "@dynatrace/strato-icons";
import {
  DetailModalShell,
  EstimatedBadge,
  Section,
  Stat,
  StatGrid,
} from "../../components/DetailModal";
import { BarList, type BarListItem } from "../../components/charts/BarList";
import { fmtCount, fmtMs, fmtPercent, fmtTokens, fmtUSD } from "../../data/format";
import { useAgentSessions, useBedrockPerf } from "../../bedrock/useBedrock";
import type { AgentSessionRow } from "../../bedrock/parse";
import type { BedrockScope } from "../../bedrock/types";
import { perfForSession, sessionModelPerf } from "./agentSessionPerf";

export interface AgentSessionTableProps {
  scope: BedrockScope;
}

/** Row enriched with its joined P95 (see agentSessionPerf.ts for the
 *  shortModelName-vs-normalizeBedrockModelId re-key this requires). */
interface EnrichedRow extends AgentSessionRow {
  p95Ms: number | undefined;
}

type SortKey = "session" | "account" | "invocations" | "tokens" | "cachePct" | "estCost" | "p95" | "errorRate";

interface Column {
  id: string;
  label: string;
  width?: number;
  grow?: boolean;
  minWidth?: number;
  align?: "left" | "right";
  sortBy?: SortKey;
}

/** Mirrors ModelsTable's colStyle helper so header cells and data cells
 *  always agree on width — see that file's comment for why this matters. */
const colStyle = (c: Pick<Column, "width" | "grow" | "minWidth">): React.CSSProperties =>
  c.grow
    ? { flex: `1 1 ${c.minWidth ?? 140}px`, minWidth: c.minWidth ?? 140, boxSizing: "border-box" }
    : { flex: "0 0 auto", width: c.width, boxSizing: "border-box" };

const TABLE_MIN_WIDTH = 980;
/** Body scroll cap (brief: "~360px") — the leaderboard scrolls internally
 *  instead of clipping to a fixed row count. Header sits outside this
 *  container, so it stays visible without needing position:sticky. */
const BODY_MAX_HEIGHT = 360;

const COLS: Column[] = [
  { id: "session", label: "Session", grow: true, minWidth: 150, sortBy: "session" },
  { id: "account", label: "Account", width: 120, sortBy: "account" },
  { id: "models", label: "Models", width: 170 },
  { id: "invocations", label: "Invocations", width: 90, align: "right", sortBy: "invocations" },
  { id: "tokens", label: "Tokens", width: 140, align: "right", sortBy: "tokens" },
  { id: "cachePct", label: "Cache %", width: 80, align: "right", sortBy: "cachePct" },
  { id: "estCost", label: "Est cost", width: 100, align: "right", sortBy: "estCost" },
  { id: "p95", label: "Latency", width: 80, align: "right", sortBy: "p95" },
  { id: "errorRate", label: "Errors", width: 80, align: "right", sortBy: "errorRate" },
];

const Cell = ({
  children,
  width,
  grow,
  minWidth,
  align,
  mono,
  style,
}: {
  children: React.ReactNode;
  width?: number;
  grow?: boolean;
  minWidth?: number;
  align?: "left" | "right";
  mono?: boolean;
  style?: React.CSSProperties;
}) => (
  <div
    style={{
      ...colStyle({ width, grow, minWidth }),
      textAlign: align,
      padding: "8px 6px",
      fontSize: 12.5,
      color: "var(--text)",
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

const Dash = () => <Text style={{ fontSize: 11.5, color: "var(--text-4)" }}>—</Text>;

/** Small pill for a session's model(s) — caps visible chips at 2 and rolls
 *  the rest into a "+N" pill (title-attribute lists the full set) so a
 *  multi-model agent session doesn't blow out the row height. */
const ModelChips = ({ models }: { models: string[] }) => {
  if (models.length === 0) return <Dash />;
  const shown = models.slice(0, 2);
  const rest = models.length - shown.length;
  return (
    <Flex gap={4} alignItems="center" title={models.join(", ")}>
      {shown.map((m) => (
        <span
          key={m}
          style={{
            padding: "1px 6px",
            borderRadius: 999,
            background: "var(--surface-3)",
            fontSize: 10.5,
            fontFamily: "var(--mono, monospace)",
            color: "var(--text-2)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 90,
          }}
        >
          {m}
        </span>
      ))}
      {rest > 0 && (
        <span style={{ fontSize: 10.5, color: "var(--text-3)", flex: "0 0 auto" }}>+{rest}</span>
      )}
    </Flex>
  );
};

/**
 * Session-detail modal (Step 2). Built with the same DetailModalShell /
 * Section / Stat / StatGrid primitives BedrockTileModal and ModelDetailModal
 * use, but kept as its own small component rather than a new BedrockTileModal
 * `kind` — that modal's props are the page-level aggregate hooks (totals,
 * daily, perfRows, …), not a single row, and threading one selected
 * AgentSessionRow through it would mean widening every one of its existing
 * `kind` branches for a shape only this one needs. All the data this modal
 * shows already lives on the clicked row (or the perf join done once in the
 * table above it), so it opens with no extra query.
 */
const SessionDetailModal = ({
  row,
  perfRows,
  onClose,
}: {
  row: AgentSessionRow;
  perfRows: ReturnType<typeof useBedrockPerf>["rows"];
  onClose: () => void;
}) => {
  const modelPerf = useMemo(() => sessionModelPerf(row, perfRows), [row, perfRows]);
  const latencyItems = useMemo<BarListItem[]>(
    () =>
      modelPerf
        .filter((m): m is { model: string; perf: NonNullable<typeof m.perf> } => m.perf != null)
        .map(({ model, perf }) => ({
          key: model,
          label: model,
          value: perf.latencyMs,
          displayValue: fmtMs(perf.latencyMs),
          secondary: `${fmtCount(perf.invocations)} invocations (model total, not session-scoped)`,
        })),
    [modelPerf],
  );

  const tokenItems: BarListItem[] = [
    { key: "input", label: "Input tokens", value: row.inTok, displayValue: fmtTokens(row.inTok) },
    { key: "output", label: "Output tokens", value: row.outTok, displayValue: fmtTokens(row.outTok) },
  ];
  const tokenColor = (item: BarListItem): string =>
    item.key === "input" ? "var(--blue)" : "var(--green-2)";

  const errorRatePct = row.errorRate * 100;

  return (
    <DetailModalShell
      title={row.session || "(unknown session)"}
      monoTitle
      subtitle={`${row.account || "unknown account"} · ${fmtCount(row.invocations)} invocations`}
      onClose={onClose}
    >
      <Section title="Summary">
        <StatGrid cols={3}>
          <Stat
            label="Est cost"
            value={fmtUSD(row.estCost)}
            sub={row.blended ? undefined : "priced from the rate card"}
            emphasize
          />
          <Stat label="Invocations" value={fmtCount(row.invocations)} />
          <Stat
            label="Error rate"
            value={row.invocations > 0 ? fmtPercent(errorRatePct) : "—"}
            danger={errorRatePct > 5}
          />
          <Stat label="Cache hit rate" value={fmtPercent(row.cachePct)} sub="of input-side tokens" />
          <Stat label="Total tokens" value={fmtTokens(row.inTok + row.outTok)} />
          <Stat label="Models used" value={fmtCount(row.models.length)} />
        </StatGrid>
        {row.blended && (
          <Flex alignItems="center" gap={8}>
            <EstimatedBadge />
          </Flex>
        )}
      </Section>

      <Section title="Models">
        <ModelChips models={row.models} />
      </Section>

      <Section title="Token mix">
        <BarList items={tokenItems} color={tokenColor} />
      </Section>

      <Section title="Per-model latency">
        {latencyItems.length > 0 ? (
          <BarList items={latencyItems} color="var(--blue)" />
        ) : (
          <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
            No matching perf data for this session's model(s) in the current scope.
          </Text>
        )}
      </Section>
    </DetailModalShell>
  );
};

/**
 * D5: scrollable agent-session leaderboard. Reads `useAgentSessions` (already
 * sorted by invocations desc / capped at 200 server-side) and re-sorts by est
 * cost desc by default — the FinOps-relevant ordering for a cost zone. Every
 * numeric column is clickable to re-sort (mirrors ModelsTable); Session/
 * Account sort lexically. Row click opens `SessionDetailModal`.
 *
 * P95 is joined from `useBedrockPerf` by the row's PRIMARY model — see
 * agentSessionPerf.ts for the shortModelName-vs-normalizeBedrockModelId
 * re-key this requires (the same mismatch that bit D2). Sessions with no
 * matching perf row show an em dash, never a fabricated 0.
 */
export const AgentSessionTable = ({ scope }: AgentSessionTableProps) => {
  const { rows, isLoading } = useAgentSessions(scope);
  const { rows: perfRows, isLoading: perfLoading } = useBedrockPerf(scope);
  const [selected, setSelected] = useState<AgentSessionRow | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "estCost",
    dir: "desc",
  });

  const enriched = useMemo<EnrichedRow[]>(
    () => rows.map((r) => ({ ...r, p95Ms: perfForSession(r, perfRows)?.latencyMs })),
    [rows, perfRows],
  );

  const sorted = useMemo(() => {
    const copy = [...enriched];
    copy.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      switch (sort.key) {
        case "session":
          return dir * a.session.localeCompare(b.session);
        case "account":
          return dir * a.account.localeCompare(b.account);
        case "invocations":
          return dir * (a.invocations - b.invocations);
        case "tokens":
          return dir * (a.inTok + a.outTok - (b.inTok + b.outTok));
        case "cachePct":
          return dir * (a.cachePct - b.cachePct);
        case "estCost":
          return dir * (a.estCost - b.estCost);
        case "p95":
          // Undefined (no perf match) sorts last regardless of direction —
          // otherwise "asc" would surface unmatched rows first as if they had
          // the lowest latency, which they simply don't have data for.
          if (a.p95Ms == null && b.p95Ms == null) return 0;
          if (a.p95Ms == null) return 1;
          if (b.p95Ms == null) return -1;
          return dir * (a.p95Ms - b.p95Ms);
        case "errorRate":
          return dir * (a.errorRate - b.errorRate);
        default:
          return 0;
      }
    });
    return copy;
  }, [enriched, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" },
    );

  const initialLoading = (isLoading || perfLoading) && rows.length === 0;

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={16}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Agent sessions
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Top 200 agent-session identities by invocation volume, sorted here by estimated cost.
            Click a row for the full breakdown.
          </Text>
        </Flex>
        <div style={{ overflowX: "auto" }}>
          <style>{`.session-row{cursor:pointer}.session-row:hover{background:var(--surface-2)}`}</style>
          <Flex flexDirection="column" gap={0} style={{ minWidth: TABLE_MIN_WIDTH }}>
            <Flex alignItems="center" style={{ padding: "0 10px", borderBottom: "1px solid var(--border)" }}>
              {COLS.map((c) => {
                const active = c.sortBy && sort.key === c.sortBy;
                const Arrow = active && sort.dir === "asc" ? ChevronUpIcon : ChevronDownIcon;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={!c.sortBy}
                    onClick={() => c.sortBy && toggleSort(c.sortBy)}
                    style={{
                      all: "unset",
                      ...colStyle(c),
                      cursor: c.sortBy ? "pointer" : "default",
                      textAlign: c.align,
                      padding: "8px 6px",
                      fontSize: 10.5,
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      color: active ? "var(--text)" : "var(--text-3)",
                    }}
                  >
                    <Flex alignItems="center" justifyContent={c.align === "right" ? "flex-end" : "flex-start"} gap={2}>
                      {c.label}
                      {active && <Arrow size={12} />}
                    </Flex>
                  </button>
                );
              })}
            </Flex>

            {initialLoading ? (
              <Flex flexDirection="column" gap={4} style={{ padding: 12 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} style={{ height: 32 }} />
                ))}
              </Flex>
            ) : sorted.length === 0 ? (
              <Flex style={{ padding: "32px 16px" }}>
                <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
                  No agent-session activity in this scope.
                </Text>
              </Flex>
            ) : (
              <div style={{ maxHeight: BODY_MAX_HEIGHT, overflowY: "auto" }}>
                {sorted.map((r, i) => (
                  <div
                    key={r.session ? `${r.session}-${r.account}` : `unknown-${i}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open details for session ${r.session || "unknown"}`}
                    className="session-row"
                    onClick={() => setSelected(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(r);
                      }
                    }}
                    style={{ display: "flex", alignItems: "center", padding: "0 10px", borderTop: "1px solid var(--border)" }}
                  >
                    <Cell grow minWidth={150} mono>
                      {r.session || "(unknown session)"}
                    </Cell>
                    <Cell width={120} mono>
                      {r.account || "—"}
                    </Cell>
                    <Cell width={170} style={{ overflow: "visible", whiteSpace: "normal" }}>
                      <ModelChips models={r.models} />
                    </Cell>
                    <Cell width={90} align="right" mono>
                      {fmtCount(r.invocations)}
                    </Cell>
                    <Cell width={140} align="right" mono>
                      {fmtTokens(r.inTok)} in / {fmtTokens(r.outTok)} out
                    </Cell>
                    <Cell width={80} align="right" mono>
                      {fmtPercent(r.cachePct)}
                    </Cell>
                    <Cell width={100} align="right" mono>
                      <span
                        title={
                          r.blended
                            ? "Estimated — model priced at a blended/fallback rate; add it to the Model Pricing table for an exact figure."
                            : "Priced from the rate card."
                        }
                        style={{ color: r.blended ? "var(--text-2)" : "var(--text)" }}
                      >
                        {r.blended && (
                          <span aria-hidden style={{ color: "var(--amber)", marginRight: 3 }}>
                            ≈
                          </span>
                        )}
                        {fmtUSD(r.estCost)}
                      </span>
                    </Cell>
                    <Cell width={80} align="right" mono>
                      {r.p95Ms == null ? <Dash /> : fmtMs(r.p95Ms)}
                    </Cell>
                    <Cell width={80} align="right" mono>
                      {r.invocations > 0 ? fmtPercent(r.errorRate * 100) : <Dash />}
                    </Cell>
                  </div>
                ))}
              </div>
            )}

            <Flex style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
              <Text style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
                P95 is the session's primary model's highest observed average latency
                (metric-derived, not a true per-session percentile) — "—" means no perf data matched
                that model in scope.
              </Text>
            </Flex>
          </Flex>
        </div>
      </Flex>

      {selected && (
        <SessionDetailModal row={selected} perfRows={perfRows} onClose={() => setSelected(null)} />
      )}
    </Surface>
  );
};
