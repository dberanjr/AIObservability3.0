import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import {
  DetailModalShell,
  EstimatedBadge,
  Section,
  Stat,
  StatGrid,
} from "../../components/DetailModal";
import { BarList, type BarListItem } from "../../components/charts/BarList";
import { EmptyState } from "../../components/EmptyState";
import { MaximizablePanel } from "../../components/MaximizablePanel";
import { DataTable, type DataColumn } from "../../components/DataTable";
import { fmtAccount, fmtCount, fmtMs, fmtPercent, fmtTokens, fmtUSDPrecise } from "../../data/format";
import { useAgentSessions, useBedrockPerf } from "../../bedrock/useBedrock";
import type { AgentSessionRow } from "../../bedrock/parse";
import type { BedrockScope } from "../../bedrock/types";
import { useAccountNames } from "../../scope/AccountNamesContext";
import { perfForSession, sessionModelPerf } from "./agentSessionPerf";

export interface AgentSessionTableProps {
  scope: BedrockScope;
}

/** Row enriched with its joined P95 (see agentSessionPerf.ts for the
 *  shortModelName-vs-normalizeBedrockModelId re-key this requires) and its
 *  "Name (id)"-formatted account label (see useAccountNames) — precomputed
 *  here, not in the column's render, since `sessionColumns` is a plain
 *  module-level array and can't call hooks itself. */
interface EnrichedRow extends AgentSessionRow {
  p95Ms: number | undefined;
  accountLabel: string;
}

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

/** Est-cost cell — flags blended/fallback pricing with a muted "≈" and an
 *  explanatory title, otherwise reads as a plain rate-card figure. */
const CostCell = ({ row }: { row: EnrichedRow }) => (
  <span
    title={
      row.blended
        ? "Estimated — model priced at a blended/fallback rate; add it to the Model Pricing table for an exact figure."
        : "Priced from the rate card."
    }
    style={{ color: row.blended ? "var(--text-2)" : "var(--text)" }}
  >
    {row.blended && (
      <span aria-hidden style={{ color: "var(--amber)", marginRight: 3 }}>
        ≈
      </span>
    )}
    {fmtUSDPrecise(row.estCost)}
  </span>
);

/** "User/Agent" shown in FULL (noTruncate) per request — resize/wrap
 *  keeps the session identity inside the column instead of clipping with an
 *  ellipsis. Account stays a separate, narrower column. */
const sessionColumns: DataColumn<EnrichedRow>[] = [
  {
    key: "session",
    header: "User/Agent",
    render: (r) => <span title={r.session || "(unknown session)"}>{r.session || "(unknown session)"}</span>,
    mono: true,
    noTruncate: true,
    width: 220,
  },
  { key: "account", header: "Account", render: (r) => r.accountLabel || "—", mono: true, width: 130 },
  { key: "models", header: "Models", render: (r) => <ModelChips models={r.models} />, width: 220, noTruncate: true },
  { key: "invocations", header: "Invocations", render: (r) => fmtCount(r.invocations), align: "right", width: 100 },
  {
    key: "tokens",
    header: "Tokens",
    render: (r) => `${fmtTokens(r.inTok)} in / ${fmtTokens(r.outTok)} out`,
    align: "right",
    mono: true,
    width: 190,
  },
  { key: "cachePct", header: "Cache %", render: (r) => fmtPercent(r.cachePct), align: "right", mono: true, width: 90 },
  { key: "estCost", header: "Est cost", render: (r) => <CostCell row={r} />, align: "right", mono: true, width: 110 },
  {
    key: "p95",
    header: "Latency",
    render: (r) => (r.p95Ms == null ? <Dash /> : fmtMs(r.p95Ms)),
    align: "right",
    mono: true,
    width: 90,
  },
  {
    key: "errorRate",
    header: "Errors",
    render: (r) => (r.invocations > 0 ? fmtPercent(r.errorRate * 100) : <Dash />),
    align: "right",
    mono: true,
    width: 90,
  },
];

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
  const { names: accountNames } = useAccountNames();
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
      subtitle={`${fmtAccount(row.account, accountNames[row.account]) || "unknown account"} · ${fmtCount(row.invocations)} invocations`}
      onClose={onClose}
    >
      <Section title="Summary">
        <StatGrid cols={3}>
          <Stat
            label="Est cost"
            value={fmtUSDPrecise(row.estCost)}
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
 * D5: agent-session leaderboard. Reads `useAgentSessions` (already sorted by
 * invocations desc / capped at 200 server-side) and re-sorts by est cost desc
 * — the FinOps-relevant ordering for a cost zone. Wrapped in MaximizablePanel
 * for a full-screen focused view; the table uses the resizable DataTable, with
 * "User/Agent" shown in full (no ellipsis). Row click opens
 * `SessionDetailModal`.
 *
 * P95 is joined from `useBedrockPerf` by the row's PRIMARY model — see
 * agentSessionPerf.ts for the shortModelName-vs-normalizeBedrockModelId
 * re-key this requires (the same mismatch that bit D2). Sessions with no
 * matching perf row show an em dash, never a fabricated 0.
 */
export const AgentSessionTable = ({ scope }: AgentSessionTableProps) => {
  const { rows, isLoading } = useAgentSessions(scope);
  const { rows: perfRows, isLoading: perfLoading } = useBedrockPerf(scope);
  const { names: accountNames } = useAccountNames();
  const [selected, setSelected] = useState<AgentSessionRow | null>(null);

  const enriched = useMemo<EnrichedRow[]>(
    () =>
      rows.map((r) => ({
        ...r,
        p95Ms: perfForSession(r, perfRows)?.latencyMs,
        accountLabel: fmtAccount(r.account, accountNames[r.account]),
      })),
    [rows, perfRows, accountNames],
  );

  const sorted = useMemo(
    () => [...enriched].sort((a, b) => b.estCost - a.estCost),
    [enriched],
  );

  const initialLoading = (isLoading || perfLoading) && rows.length === 0;

  const totalInvocations = rows.reduce((s, r) => s + r.invocations, 0);
  const totalCost = rows.reduce((s, r) => s + r.estCost, 0);
  const stats = [
    { label: "Sessions", value: fmtCount(rows.length) },
    { label: "Total invocations", value: fmtCount(totalInvocations) },
    { label: "Total est cost", value: fmtUSDPrecise(totalCost) },
  ];

  const body = (expanded: boolean) => {
    const tableH = expanded ? 700 : 360;
    return (
      <Flex flexDirection="column" gap={8}>
        {initialLoading ? (
          <Flex flexDirection="column" gap={4} style={{ padding: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 32 }} />
            ))}
          </Flex>
        ) : sorted.length === 0 ? (
          <EmptyState
            bare
            title="No agent-session activity in this scope"
            description="No Bedrock agent-session identities matched the current scope."
          />
        ) : (
          <DataTable
            columns={sessionColumns}
            rows={sorted}
            rowKey={(r, i) => (r.session ? `${r.session}-${r.account}` : `unknown-${i}`)}
            maxHeight={tableH}
            onRowClick={(row) => setSelected(row)}
          />
        )}

        <Flex style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
          <Text style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
            Latency shown is the session's primary model's highest observed average latency
            (metric-derived, not a true per-session percentile) — "—" means no perf data matched
            that model in scope.
          </Text>
        </Flex>
      </Flex>
    );
  };

  return (
    <>
      <MaximizablePanel
        title="Agent sessions"
        subtitle="Top 200 agent-session identities by invocation volume, sorted here by estimated cost. Click a row for the full breakdown."
        stats={stats}
        expanded={body(true)}
      >
        {body(false)}
      </MaximizablePanel>

      {selected && (
        <SessionDetailModal row={selected} perfRows={perfRows} onClose={() => setSelected(null)} />
      )}
    </>
  );
};
