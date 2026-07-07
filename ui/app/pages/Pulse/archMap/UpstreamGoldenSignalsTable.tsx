/**
 * Upstream callers table for the Pulse "upstream services" detail modal —
 * every monitored caller of the in-scope AI footprint, with RED metrics and
 * a fan-out count into AI services. Mirrors Explorer/AIServicesTable's
 * CSS-grid pattern exactly (single GRID_TEMPLATE driving header + every row,
 * overflow-x:auto wrapper + min-width inner holder, HeaderCell/Cell, the same
 * RowStatus glyph convention) so columns line up regardless of content.
 */
import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { fmtCount, fmtMs, fmtPercent } from "../../../data/format";
import { errorRateStatus } from "../../Explorer/serviceStatus";
import { statusColor, STATUS_CUE } from "../../../theme/statusColor";
import { smartscapeEntityUrl } from "./smartscapeUrl";
import { sortCallers, type SortKey, type UpstreamCaller } from "./upstreamGraph";

interface ColDef {
  id: string;
  label: string;
  /** CSS grid track size for this column. */
  track: string;
  align?: "left" | "right";
  /** When set, the header is a sort toggle over this key. */
  sortKey?: SortKey;
}

// One column template drives the header AND every row (via CSS grid) so
// columns line up perfectly regardless of content — same pattern as
// Explorer/AIServicesTable. Service is the single flexible track (minmax →
// never crushed below a readable width); everything else is fixed.
const COLS: ColDef[] = [
  { id: "status", label: "", track: "28px" },
  { id: "service", label: "Service", track: "minmax(200px, 2fr)", sortKey: "name" },
  { id: "requests", label: "Requests", track: "96px", align: "right", sortKey: "requests" },
  { id: "errPct", label: "Err %", track: "84px", align: "right", sortKey: "errPct" },
  { id: "p90", label: "P90", track: "88px", align: "right", sortKey: "p90Ms" },
  { id: "p95", label: "P95", track: "88px", align: "right", sortKey: "p95Ms" },
  {
    id: "throughput",
    label: "Throughput",
    track: "108px",
    align: "right",
    sortKey: "throughputPerMin",
  },
  {
    id: "aiServices",
    label: "→ AI services",
    track: "120px",
    align: "right",
    sortKey: "aiServices",
  },
  { id: "drill", label: "", track: "40px" },
];

const GRID_TEMPLATE = COLS.map((c) => c.track).join(" ");
// Sum of the fixed tracks + Service's minimum. Below this the table scrolls
// horizontally instead of crushing the Service name to a single character.
const MIN_W = 852;

/** String keys default to ascending; numeric keys to descending on first click. */
const STRING_KEYS: ReadonlySet<SortKey> = new Set(["name"]);

interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

const HeaderCell = ({
  col,
  sort,
  onSort,
}: {
  col: ColDef;
  sort: SortState | null;
  onSort: (key: SortKey) => void;
}) => {
  const active = sort && col.sortKey === sort.key;
  const ariaSort: React.AriaAttributes["aria-sort"] = col.sortKey
    ? active
      ? sort.dir === "asc"
        ? "ascending"
        : "descending"
      : "none"
    : undefined;

  const base: React.CSSProperties = {
    minWidth: 0,
    textAlign: col.align,
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: active ? "var(--text-2)" : "var(--text-3)",
    padding: "8px 6px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  if (!col.sortKey) {
    return (
      <div role="columnheader" style={base}>
        {col.label}
      </div>
    );
  }

  return (
    <div role="columnheader" aria-sort={ariaSort} style={base}>
      <button
        type="button"
        onClick={() => onSort(col.sortKey!)}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          width: "100%",
          justifyContent: col.align === "right" ? "flex-end" : "flex-start",
          color: "inherit",
          font: "inherit",
          letterSpacing: "inherit",
          textTransform: "inherit",
        }}
        title={`Sort by ${col.label}`}
      >
        {col.label}
        <span aria-hidden style={{ fontSize: 9, opacity: active ? 1 : 0.35 }}>
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "▾"}
        </span>
      </button>
    </div>
  );
};

const Cell = ({
  children,
  align,
  style,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  style?: React.CSSProperties;
}) => (
  <div
    style={{
      minWidth: 0,
      textAlign: align,
      padding: "8px 6px",
      fontSize: 12.5,
      color: "var(--text)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </div>
);

/** Leading-column row health cue — identical convention to AIServicesTable's
 *  RowStatus: a status-shaped glyph (● good / ▲ warning / ⬤ critical) coloured
 *  via the shared statusColor, with an accessible label so severity never
 *  relies on colour alone. Thresholds come from the shared errorRateStatus, so
 *  the dot agrees with every other error-rate cue in the app. */
const RowStatus = ({ errPct }: { errPct: number }) => {
  const status = errorRateStatus(errPct);
  const cue = STATUS_CUE[status];
  const label = `${cue.label} — ${fmtPercent(errPct)} error rate`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      style={{
        display: "inline-block",
        color: statusColor(status),
        fontSize: 11,
        lineHeight: 1,
      }}
    >
      {cue.glyph}
    </span>
  );
};

const numericCellStyle: React.CSSProperties = {
  fontFamily: "var(--mono, monospace)",
  fontVariantNumeric: "tabular-nums",
};

export interface UpstreamGoldenSignalsTableProps {
  callers: UpstreamCaller[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/** Golden-signals table of upstream callers, for the Pulse "upstream
 *  services" detail modal. Row click toggles selection (a second click on the
 *  selected row clears it); the ↗ cell deep-links to Smartscape without also
 *  toggling the row. */
export const UpstreamGoldenSignalsTable = ({
  callers,
  selectedId,
  onSelect,
}: UpstreamGoldenSignalsTableProps) => {
  const [sort, setSort] = useState<SortState | null>(null);

  const sorted = useMemo(
    () => (sort ? sortCallers(callers, sort.key, sort.dir) : callers),
    [callers, sort],
  );

  const onSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev && prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: STRING_KEYS.has(key) ? "asc" : "desc" };
    });
  };

  return (
    <Flex flexDirection="column" gap={0} role="table" aria-label="Upstream services">
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: MIN_W }}>
          <div
            role="row"
            style={{
              display: "grid",
              gridTemplateColumns: GRID_TEMPLATE,
              alignItems: "center",
              padding: "0 10px",
            }}
          >
            {COLS.map((c) => (
              <HeaderCell key={c.id} col={c} sort={sort} onSort={onSort} />
            ))}
          </div>

          {sorted.length === 0 ? (
            <Flex style={{ padding: "32px 16px" }}>
              <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
                No upstream callers in scope.
              </Text>
            </Flex>
          ) : (
            <Flex flexDirection="column" gap={0}>
              {sorted.map((c) => {
                const selected = c.id === selectedId;
                return (
                  <div
                    key={c.id}
                    role="row"
                    tabIndex={0}
                    aria-selected={selected}
                    onClick={() => onSelect(selected ? null : c.id)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(selected ? null : c.id);
                      }
                    }}
                    style={{
                      display: "grid",
                      gridTemplateColumns: GRID_TEMPLATE,
                      alignItems: "center",
                      padding: "0 10px",
                      borderTop: "1px solid var(--border)",
                      borderLeft: selected
                        ? "2px solid var(--blue)"
                        : "2px solid transparent",
                      cursor: "pointer",
                      background: selected
                        ? "color-mix(in oklab, var(--blue) 6%, transparent)"
                        : undefined,
                    }}
                  >
                    <Cell>
                      <RowStatus errPct={c.errPct} />
                    </Cell>
                    <Cell style={{ fontFamily: "var(--mono, monospace)", fontSize: 12.5 }}>
                      <span title={c.name}>{c.name}</span>
                    </Cell>
                    <Cell align="right" style={numericCellStyle}>
                      {fmtCount(c.requests)}
                    </Cell>
                    <Cell align="right" style={numericCellStyle}>
                      {fmtPercent(c.errPct)}
                    </Cell>
                    <Cell align="right" style={numericCellStyle}>
                      {fmtMs(c.p90Ms)}
                    </Cell>
                    <Cell align="right" style={numericCellStyle}>
                      {fmtMs(c.p95Ms)}
                    </Cell>
                    <Cell align="right" style={numericCellStyle}>
                      {fmtCount(c.throughputPerMin)}/min
                    </Cell>
                    <Cell align="right" style={numericCellStyle}>
                      {fmtCount(c.aiServiceIds.length)}
                    </Cell>
                    <Cell align="right">
                      <a
                        href={smartscapeEntityUrl(c.id)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="Open in Smartscape"
                        aria-label={`Open ${c.name} in Smartscape`}
                        style={{
                          color: "var(--text-3)",
                          textDecoration: "none",
                          fontSize: 13,
                        }}
                      >
                        ↗
                      </a>
                    </Cell>
                  </div>
                );
              })}
            </Flex>
          )}
        </div>
      </div>
    </Flex>
  );
};
