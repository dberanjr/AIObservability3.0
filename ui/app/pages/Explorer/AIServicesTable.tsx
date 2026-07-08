import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import {
  ChevronRightIcon,
  WarningIcon,
} from "@dynatrace/strato-icons";
import { fmtCount, fmtPercent, fmtTokens, fmtUSDCompact } from "../../data/format";
import {
  PROVIDER_COLOR,
  normalizeProvider,
  canonicalizeModel,
} from "../../detection/attributes";
import { FilterTrigger } from "../../components/FilterTrigger";
import { estimateServiceRowCost, type ServiceRowCost } from "./serviceModelCost";
import { errorRateStatus } from "./serviceStatus";
import { statusColor, STATUS_CUE } from "../../theme/statusColor";
import type { AIService } from "./useAIServices";

/** Client-side sort keys. `null` (no active sort) preserves the query order
 *  (tokens desc). String keys sort alphabetically; the rest are numeric. */
type SortKey =
  | "service"
  | "framework"
  | "req"
  | "tokens"
  | "cost"
  | "tokPerReq"
  | "agents"
  | "errors"
  | "logical";

interface ColDef {
  id: string;
  label: string;
  /** CSS grid track size for this column. */
  track: string;
  align?: "left" | "right";
  /** When set, the header is a sort toggle over this key. */
  sortKey?: SortKey;
}

// One column template drives the header AND every row (via CSS grid) so columns
// line up perfectly regardless of content. Service is the single flexible track
// (minmax → never crushed below a readable width); everything else is fixed.
const COLS: ColDef[] = [
  { id: "status", label: "", track: "28px" },
  { id: "service", label: "Service", track: "minmax(180px, 2fr)", sortKey: "service" },
  { id: "framework", label: "Framework", track: "120px", sortKey: "framework" },
  { id: "models", label: "Models", track: "220px" },
  { id: "req", label: "LLM req", track: "88px", align: "right", sortKey: "req" },
  { id: "tokens", label: "Tokens", track: "96px", align: "right", sortKey: "tokens" },
  { id: "cost", label: "Est. cost", track: "104px", align: "right", sortKey: "cost" },
  { id: "tokPerReq", label: "Tok/req", track: "92px", align: "right", sortKey: "tokPerReq" },
  { id: "agents", label: "Agents", track: "76px", align: "right", sortKey: "agents" },
  { id: "errors", label: "Errors", track: "132px", align: "right", sortKey: "errors" },
  { id: "logical", label: "Logical err", track: "108px", align: "right", sortKey: "logical" },
  { id: "drill", label: "", track: "28px" },
];

const GRID_TEMPLATE = COLS.map((c) => c.track).join(" ");
// Sum of the fixed tracks + Service's minimum. Below this the table scrolls
// horizontally instead of crushing the Service name to a single character.
const MIN_W = 1272;

/** String keys default to ascending; numeric keys to descending on first click. */
const STRING_KEYS: ReadonlySet<SortKey> = new Set(["service", "framework"]);

interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

/** A row paired with its estimated cost (memoised once per rows change). */
interface PricedRow {
  row: AIService;
  cost: ServiceRowCost;
}

const sortValue = (item: PricedRow, key: SortKey): number | string => {
  switch (key) {
    case "service":
      return item.row.service.toLowerCase();
    case "framework":
      return (item.row.framework ?? "").toLowerCase();
    case "req":
      return item.row.requests;
    case "tokens":
      return item.row.tokens;
    case "cost":
      return item.cost.usd;
    case "tokPerReq":
      return item.row.tokPerReq;
    case "agents":
      return item.row.agents;
    case "errors":
      return item.row.errorRatePct;
    case "logical":
      return item.row.logicalErrors;
  }
};

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
    // Right-aligned numeric headers: keep the label + sort caret flush right.
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
  /** Legacy prop — column widths are now driven by the shared grid template. */
  width?: number;
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

const ModelChips = ({
  models,
  rawModels,
}: {
  models: string[];
  rawModels: string[];
}) => (
  <Flex gap={4} style={{ flexWrap: "wrap" }}>
    {models.slice(0, 3).map((m) => {
      const provider = normalizeProvider(undefined, m);
      // Raw gen_ai.request.model values that canonicalize to this chip label.
      const variants = rawModels.filter(
        (raw) => canonicalizeModel(raw).label === m,
      );
      return (
        <FilterTrigger
          key={m}
          attribute="gen_ai.request.model"
          value={variants.length > 0 ? variants : m}
          label="model"
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 6px",
              borderRadius: 999,
              border: `1px solid color-mix(in oklab, ${PROVIDER_COLOR[provider.id]} 40%, transparent)`,
              background: `color-mix(in oklab, ${PROVIDER_COLOR[provider.id]} 10%, transparent)`,
              fontFamily: "var(--mono, monospace)",
              fontSize: 11,
              color: "var(--text-2)",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: PROVIDER_COLOR[provider.id],
              }}
            />
            {m}
          </span>
        </FilterTrigger>
      );
    })}
    {models.length > 3 && (
      <span
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          alignSelf: "center",
        }}
      >
        +{models.length - 3}
      </span>
    )}
  </Flex>
);

/** Estimated-cost cell. A blended/multi-model estimate carries a subtle amber
 *  "≈" marker (same convention as the heatmap-cell modal's EstimatedBadge). */
const CostCell = ({ cost }: { cost: ServiceRowCost }) => (
  <Cell
    width={96}
    align="right"
    style={{ fontFamily: "var(--mono, monospace)", fontVariantNumeric: "tabular-nums" }}
  >
    <span
      title={
        cost.estimated
          ? "Estimated — priced at a blended/aggregated model rate. Open a heatmap cell for an exact per-model figure."
          : "Priced from the model's list rate."
      }
      style={{ color: cost.estimated ? "var(--text-2)" : "var(--text)" }}
    >
      {cost.estimated && (
        <span aria-hidden style={{ color: "var(--amber)", marginRight: 3 }}>
          ≈
        </span>
      )}
      {fmtUSDCompact(cost.usd)}
    </span>
  </Cell>
);

/** Leading-column row health cue. A status-shaped glyph (● good / ▲ warning /
 *  ⬤ critical) coloured via the shared statusColor, plus an accessible label —
 *  so row severity reads without relying on colour alone. Thresholds come from
 *  the shared errorRateStatus, so the dot agrees with the Errors KPI tile. */
const RowStatus = ({ errorRatePct }: { errorRatePct: number }) => {
  const status = errorRateStatus(errorRatePct);
  const cue = STATUS_CUE[status];
  const label = `${cue.label} — ${fmtPercent(errorRatePct)} error rate`;
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

export interface AIServicesTableProps {
  rows: AIService[];
  isLoading: boolean;
  /** True when the underlying query hit its row cap (more services exist). */
  truncated?: boolean;
  onRowClick?: (row: AIService) => void;
  /** Controlled collapse state, so a KPI tile can force this card open. */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
}

const AIServicesTableBody = ({
  rows,
  isLoading,
  truncated,
  onRowClick,
}: AIServicesTableProps) => {
  const [sort, setSort] = useState<SortState | null>(null);

  const priced = useMemo<PricedRow[]>(
    () =>
      rows.map((row) => ({
        row,
        cost: estimateServiceRowCost({
          inTok: row.inTok,
          outTok: row.outTok,
          models: row.models,
        }),
      })),
    [rows],
  );

  const sorted = useMemo<PricedRow[]>(() => {
    if (!sort) return priced;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...priced].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (typeof av === "string" || typeof bv === "string") {
        return String(av).localeCompare(String(bv)) * dir;
      }
      return (av - bv) * dir;
    });
  }, [priced, sort]);

  const onSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev && prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: STRING_KEYS.has(key) ? "asc" : "desc" };
    });
  };

  return (
    <Flex flexDirection="column" gap={0} role="table" aria-label="AI services">
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

      {isLoading && rows.length === 0 ? (
        <Flex flexDirection="column" gap={4} style={{ padding: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} style={{ height: 36 }} />
          ))}
        </Flex>
      ) : rows.length === 0 ? (
        <Flex style={{ padding: "32px 16px" }}>
          <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            No AI services match the current filters.
          </Text>
        </Flex>
      ) : (
        <Flex flexDirection="column" gap={0}>
          {sorted.map(({ row: r, cost }) => (
            <div
              key={r.serviceId}
              role="row"
              tabIndex={onRowClick ? 0 : -1}
              onClick={() => onRowClick?.(r)}
              onKeyDown={(e) => {
                if (onRowClick && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onRowClick(r);
                }
              }}
              style={{
                display: "grid",
                gridTemplateColumns: GRID_TEMPLATE,
                alignItems: "center",
                padding: "0 10px",
                borderTop: "1px solid var(--border)",
                cursor: onRowClick ? "pointer" : "default",
                background:
                  r.logicalErrors > 0
                    ? "color-mix(in oklab, var(--amber) 4%, transparent)"
                    : undefined,
              }}
            >
              <Cell width={24}>
                <RowStatus errorRatePct={r.errorRatePct} />
              </Cell>
              <Cell
                style={{
                  fontFamily: "var(--mono, monospace)",
                  fontSize: 12.5,
                }}
              >
                <FilterTrigger
                  attribute="service.name"
                  value={r.service}
                  label="service"
                >
                  {r.service}
                </FilterTrigger>
              </Cell>
              <Cell width={120}>
                {r.framework ? (
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "var(--surface-3)",
                      fontSize: 11,
                      color: "var(--text-2)",
                    }}
                  >
                    {r.framework}
                  </span>
                ) : (
                  <Text style={{ fontSize: 11, color: "var(--text-4)" }}>—</Text>
                )}
              </Cell>
              <Cell
                width={220}
                style={{ whiteSpace: "normal", overflow: "visible" }}
              >
                <ModelChips models={r.modelDisplay} rawModels={r.models} />
              </Cell>
              <Cell
                width={80}
                align="right"
                style={{
                  fontFamily: "var(--mono, monospace)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtCount(r.requests)}
              </Cell>
              <Cell
                width={90}
                align="right"
                style={{
                  fontFamily: "var(--mono, monospace)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtTokens(r.tokens)}
              </Cell>
              <CostCell cost={cost} />
              <Cell
                width={90}
                align="right"
                style={{
                  fontFamily: "var(--mono, monospace)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtCount(r.tokPerReq)}
              </Cell>
              <Cell
                width={70}
                align="right"
                style={{
                  fontFamily: "var(--mono, monospace)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtCount(r.agents)}
              </Cell>
              <Cell
                width={90}
                align="right"
                style={{
                  fontFamily: "var(--mono, monospace)",
                  fontVariantNumeric: "tabular-nums",
                  color: r.errors > 0 ? "var(--amber)" : "var(--text)",
                }}
              >
                {r.errors > 0
                  ? `${fmtCount(r.errors)} (${fmtPercent(r.errorRatePct)})`
                  : "0"}
              </Cell>
              <Cell width={100} align="right">
                {r.logicalErrors > 0 ? (
                  <Flex
                    alignItems="center"
                    gap={4}
                    justifyContent="flex-end"
                    style={{ color: "var(--amber)" }}
                  >
                    <WarningIcon size={14} />
                    <Text
                      style={{
                        fontFamily: "var(--mono, monospace)",
                        fontSize: 12.5,
                        color: "var(--amber)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {fmtCount(r.logicalErrors)}
                    </Text>
                  </Flex>
                ) : (
                  <Text
                    style={{
                      fontFamily: "var(--mono, monospace)",
                      fontSize: 12.5,
                      color: "var(--text-4)",
                    }}
                  >
                    0
                  </Text>
                )}
              </Cell>
              <Cell width={24}>
                {onRowClick && (
                  <ChevronRightIcon
                    size={14}
                    style={{ color: "var(--text-3)" }}
                  />
                )}
              </Cell>
            </div>
          ))}
        </Flex>
      )}
      </div>
     </div>

      {truncated && rows.length > 0 && (
        <Flex
          alignItems="center"
          gap={6}
          style={{
            padding: "8px 16px",
            borderTop: "1px solid var(--border)",
          }}
        >
          <WarningIcon size={14} style={{ color: "var(--text-3)", flex: "0 0 auto" }} />
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Showing the top 200 services by tokens — narrow the scope (timeframe or
            filters) to surface the rest.
          </Text>
        </Flex>
      )}

      <Flex
        style={{
          padding: "10px 16px",
          borderTop: "1px solid var(--border)",
          background: "var(--surface-2)",
        }}
      >
        <Text
          style={{
            fontSize: 11,
            color: "var(--text-3)",
            lineHeight: 1.5,
          }}
        >
          Logical errors are HTTP 200 responses with payload-level failures.
          The load-bearing signal here is{" "}
          <code>gen_ai.response.finish_reasons</code> containing{" "}
          <code>max_tokens</code> (truncated output), <code>content_filter</code>,
          or <code>refusal</code>. OTel markers (<code>gen_ai.error.type</code>,
          guardrail/moderation events, <code>gen_ai.response.refusal_reason</code>)
          are also counted when present, but emit no data in this environment.
          Est. cost prices each service's tokens against the model rate table;
          <span style={{ color: "var(--amber)" }}> ≈</span> marks a blended or
          multi-model estimate.
        </Text>
      </Flex>
    </Flex>
  );
};

export const AIServicesTable = (props: AIServicesTableProps) => (
  <CollapsibleCard
    title="AI services"
    open={props.open}
    onOpenChange={props.onOpenChange}
    subtitle={
      <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
        Any monitored service that emitted LLM spans
        (<code>gen_ai.provider.name</code>) in scope — classified
        automatically, no tagging required.
      </Text>
    }
    headerRight={
      <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
        {props.truncated ? "top " : ""}
        {props.rows.length} {props.rows.length === 1 ? "service" : "services"}
      </Text>
    }
    defaultOpen
  >
    <AIServicesTableBody {...props} />
  </CollapsibleCard>
);
