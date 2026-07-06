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
  width?: number;
  align?: "left" | "right";
  /** When set, the header is a sort toggle over this key. */
  sortKey?: SortKey;
}

const COLS: ColDef[] = [
  { id: "status", label: "", width: 24 },
  { id: "service", label: "Service", sortKey: "service" },
  { id: "framework", label: "Framework", width: 120, sortKey: "framework" },
  { id: "models", label: "Models", width: 220 },
  { id: "req", label: "LLM req", width: 80, align: "right", sortKey: "req" },
  { id: "tokens", label: "Tokens", width: 90, align: "right", sortKey: "tokens" },
  { id: "cost", label: "Est. cost", width: 96, align: "right", sortKey: "cost" },
  { id: "tokPerReq", label: "Tok/req", width: 90, align: "right", sortKey: "tokPerReq" },
  { id: "agents", label: "Agents", width: 70, align: "right", sortKey: "agents" },
  { id: "errors", label: "Errors", width: 90, align: "right", sortKey: "errors" },
  { id: "logical", label: "Logical err", width: 100, align: "right", sortKey: "logical" },
  { id: "drill", label: "", width: 24 },
];

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
    flex: col.width ? "0 0 auto" : 1,
    width: col.width,
    textAlign: col.align,
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: active ? "var(--text-2)" : "var(--text-3)",
    padding: "8px 6px",
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
  width,
  align,
  style,
}: {
  children: React.ReactNode;
  width?: number;
  align?: "left" | "right";
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
      <div
        role="row"
        style={{ display: "flex", alignItems: "center", padding: "0 10px" }}
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
                display: "flex",
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
                <span
                  aria-hidden
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background:
                      r.errorRatePct > 5
                        ? "var(--red)"
                        : r.errorRatePct > 1
                          ? "var(--amber)"
                          : "var(--green-2)",
                  }}
                />
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
                {fmtTokens(Math.round(r.tokPerReq))}
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
